/**
 * n8n External Hooks for OIDC Authentication
 *
 * This file implements OIDC authentication support for n8n using only built-in Node.js modules.
 * It provides:
 * - OIDC discovery endpoint support
 * - Authorization code flow
 * - User provisioning (JIT - Just In Time)
 * - Frontend customization to show OIDC login button
 *
 * Environment Variables Required:
 * - OIDC_ISSUER_URL: The OIDC provider's issuer URL (e.g., https://auth.example.com)
 * - OIDC_CLIENT_ID: OAuth2 client ID
 * - OIDC_CLIENT_SECRET: OAuth2 client secret
 * - OIDC_REDIRECT_URI: The callback URL (e.g., https://n8n.example.com/auth/oidc/callback)
 *
 * Optional:
 * - OIDC_SCOPES: Space-separated list of scopes (default: "openid email profile")
 * - N8N_ROOT: Path to the n8n package root (default: /usr/local/lib/node_modules/n8n)
 *
 * Hardening notes (patched for n8n >= 2.45):
 * - n8n internals are resolved through n8n's own module resolution (createRequire),
 *   with several fallbacks, instead of hardcoded dist/ paths.
 * - If no usable session issuer can be found, OIDC is disabled with a loud log
 *   message instead of crashing n8n at startup (email/password login keeps working).
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { URL, URLSearchParams } = require('url');
const { createRequire } = require('module');

// Configuration from environment
const config = {
  issuerUrl: process.env.OIDC_ISSUER_URL,
  clientId: process.env.OIDC_CLIENT_ID,
  clientSecret: process.env.OIDC_CLIENT_SECRET,
  redirectUri: process.env.OIDC_REDIRECT_URI,
  scopes: process.env.OIDC_SCOPES || 'openid email profile',
};

// Validate configuration
function validateConfig() {
  const missing = [];
  if (!config.issuerUrl) missing.push('OIDC_ISSUER_URL');
  if (!config.clientId) missing.push('OIDC_CLIENT_ID');
  if (!config.clientSecret) missing.push('OIDC_CLIENT_SECRET');
  if (!config.redirectUri) missing.push('OIDC_REDIRECT_URI');
  return missing;
}

// Cache for OIDC discovery document
let discoveryCache = null;
let discoveryCacheTime = 0;
const DISCOVERY_CACHE_TTL = 3600000; // 1 hour

/**
 * Make an HTTP/HTTPS request
 * @param {string} url - The URL to request
 * @param {object} options - Request options
 * @returns {Promise<{statusCode: number, headers: object, body: string}>}
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = protocol.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

/**
 * Fetch OIDC discovery document
 * @returns {Promise<object>}
 */
async function fetchDiscoveryDocument() {
  const now = Date.now();
  if (discoveryCache && now - discoveryCacheTime < DISCOVERY_CACHE_TTL) {
    return discoveryCache;
  }

  const discoveryUrl = config.issuerUrl.replace(/\/$/, '') + '/.well-known/openid-configuration';
  const response = await makeRequest(discoveryUrl);

  if (response.statusCode !== 200) {
    throw new Error(`Failed to fetch OIDC discovery document: ${response.statusCode}`);
  }

  discoveryCache = JSON.parse(response.body);
  discoveryCacheTime = now;
  return discoveryCache;
}

/**
 * Generate a random string for state/nonce
 * @param {number} length
 * @returns {string}
 */
function generateRandomString(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Base64URL encode
 * @param {Buffer|string} input
 * @returns {string}
 */
function base64UrlEncode(input) {
  const base64 = Buffer.isBuffer(input) ? input.toString('base64') : Buffer.from(input).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Base64URL decode
 * @param {string} input
 * @returns {Buffer}
 */
function base64UrlDecode(input) {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

/**
 * Decode JWT without verification (for extracting claims)
 * @param {string} token
 * @returns {object}
 */
function decodeJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8'));
  return payload;
}

/**
 * Exchange authorization code for tokens
 * @param {string} code
 * @param {object} discovery
 * @returns {Promise<object>}
 */
async function exchangeCodeForTokens(code, discovery) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await makeRequest(discovery.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (response.statusCode !== 200) {
    console.error('Token exchange failed:', response.body);
    throw new Error(`Token exchange failed: ${response.statusCode}`);
  }

  return JSON.parse(response.body);
}

/**
 * Fetch user info from OIDC provider
 * @param {string} accessToken
 * @param {object} discovery
 * @returns {Promise<object>}
 */
async function fetchUserInfo(accessToken, discovery) {
  const response = await makeRequest(discovery.userinfo_endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.statusCode !== 200) {
    console.error('UserInfo fetch failed:', response.body);
    throw new Error(`UserInfo fetch failed: ${response.statusCode}`);
  }

  return JSON.parse(response.body);
}

/**
 * Create a signed JWT for state/nonce storage
 * We use HMAC for these short-lived cookies
 * @param {object} payload
 * @param {string} secret
 * @param {number} expiresInSeconds
 * @returns {string}
 */
function createSignedCookie(payload, secret, expiresInSeconds = 900) {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const data = JSON.stringify({ ...payload, exp });
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  const signature = hmac.digest('hex');
  return base64UrlEncode(data) + '.' + signature;
}

/**
 * Constant-time string comparison
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify and decode a signed cookie
 * @param {string} cookie
 * @param {string} secret
 * @returns {object|null}
 */
function verifySignedCookie(cookie, secret) {
  try {
    const [dataB64, signature] = cookie.split('.');
    const data = base64UrlDecode(dataB64).toString('utf8');

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(data);
    const expectedSignature = hmac.digest('hex');

    if (!safeEqual(signature, expectedSignature)) {
      return null;
    }

    const payload = JSON.parse(data);
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Get or create the cookie signing secret
 * We derive it from the n8n encryption key if available
 * @param {object} context
 * @returns {string}
 */
function getCookieSecret(context) {
  // Use a combination of environment variables to create a stable secret
  const baseKey = process.env.N8N_ENCRYPTION_KEY || process.env.OIDC_CLIENT_SECRET || 'n8n-oidc-hook-secret';
  const hash = crypto.createHash('sha256').update(baseKey + '-oidc-state').digest('hex');
  return hash;
}

/**
 * Create the n8n auth token using n8n's JwtService (fallback path only)
 * @param {object} user
 * @param {object} jwtService - n8n's JwtService instance
 * @returns {string}
 */
function createAuthToken(user, jwtService) {
  // n8n's JWT contains: { id, hash, browserId?, usedMfa? }
  const payload = {
    id: user.id,
    hash: createUserHash(user),
    usedMfa: false,
  };

  return jwtService.sign('session', payload, { expiresIn: '7d' });
}

/**
 * Create user hash for JWT (mimics n8n's AuthService.createJWTHash)
 * @param {object} user
 * @returns {string}
 */
function createUserHash(user) {
  const payload = [user.email, user.password || ''];
  if (user.mfaEnabled && user.mfaSecret) {
    payload.push(user.mfaSecret.substring(0, 3));
  }
  return crypto.createHash('sha256').update(payload.join(':')).digest('base64').substring(0, 10);
}

/**
 * Check if email is valid
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// ---------------------------------------------------------------------------
// n8n internals (resolved via n8n's own module resolution, not hardcoded paths)
// ---------------------------------------------------------------------------

// createRequire anchored at n8n's package root resolves to the same files n8n
// itself loaded, so DI singletons (AuthService, JwtService) are the instances
// n8n initialized.
const N8N_ROOT = process.env.N8N_ROOT || '/usr/local/lib/node_modules/n8n';
const n8nRequire = createRequire(`${N8N_ROOT}/package.json`);

const authCookieOptions = {
  httpOnly: true,
  secure: process.env.N8N_PROTOCOL === 'https',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// Module specifiers, newest/most stable first.
const SESSION_ISSUER_SPECS = {
  issueCookie: './dist/auth/jwt.js', // exists in 2.44.2 and 2.45.1
  jwtServiceLocations: [
    '@n8n/backend-services', // JwtService moved here in 2.45
    './dist/services/jwt.service.js', // n8n <= 2.44
  ],
};

/**
 * Cheap check (resolve only, nothing is loaded) used by the frontend.settings
 * hook, which runs before n8n.ready. Avoids advertising SSO when the backend
 * routes can't work.
 * @returns {boolean}
 */
function sessionIssuerAvailable() {
  const specs = [SESSION_ISSUER_SPECS.issueCookie, ...SESSION_ISSUER_SPECS.jwtServiceLocations];
  return specs.some((spec) => {
    try {
      n8nRequire.resolve(spec);
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Find a way to issue an n8n session cookie. Throws a descriptive error if
 * every strategy fails.
 * @returns {{label: string, issue: (res: object, user: object) => void}}
 */
function resolveSessionIssuer() {
  const errors = [];

  // 1) n8n's own cookie issuer: correct hash, secret and cookie flags
  //    for whatever version is installed.
  try {
    const { issueCookie } = n8nRequire(SESSION_ISSUER_SPECS.issueCookie);
    if (typeof issueCookie !== 'function') throw new Error('no issueCookie export');
    return {
      label: 'dist/auth/jwt.js issueCookie',
      issue: (res, user) => issueCookie(res, user),
    };
  } catch (e) {
    errors.push(`${SESSION_ISSUER_SPECS.issueCookie}: ${e.message}`);
  }

  // 2) Sign the session token ourselves with n8n's JwtService.
  for (const spec of SESSION_ISSUER_SPECS.jwtServiceLocations) {
    try {
      const { JwtService } = n8nRequire(spec);
      if (typeof JwtService !== 'function') throw new Error('no JwtService export');
      const { Container } = n8nRequire('@n8n/di');
      const jwtService = Container.get(JwtService);
      if (typeof jwtService.sign !== 'function') throw new Error('instance has no sign()');
      return {
        label: `manual sign via ${spec}`,
        issue: (res, user) => res.cookie('n8n-auth', createAuthToken(user, jwtService), authCookieOptions),
      };
    } catch (e) {
      errors.push(`${spec}: ${e.message}`);
    }
  }

  throw new Error(`No usable session issuer found:\n  ${errors.join('\n  ')}`);
}

/**
 * Find a way to create a new n8n user together with their personal project.
 * Throws a descriptive error if every strategy fails.
 * @param {object} User this.dbCollections.User from the hook context
 * @returns {{label: string, create: (data: object) => Promise<{user: object}>}}
 */
function resolveUserCreator(User) {
  const errors = [];

  // 1) n8n <= 2.48: the method is on dbCollections.User
  if (User && typeof User.createUserWithProject === 'function') {
    return {
      label: 'dbCollections.User.createUserWithProject',
      create: (data) => User.createUserWithProject(data),
    };
  }
  errors.push('dbCollections.User.createUserWithProject: not a function');

  // 2) n8n >= 2.49: renamed and moved to PersonRepository, which dbCollections
  //    no longer exposes (it hands out a bare table), so ask n8n's DI container.
  try {
    const { Container } = n8nRequire('@n8n/di');
    const { PersonRepository } = n8nRequire('@n8n/db');
    const repo = Container.get(PersonRepository);
    if (typeof repo.createPersonWithProject !== 'function') {
      throw new Error('no createPersonWithProject()');
    }
    return {
      label: 'PersonRepository.createPersonWithProject',
      create: (data) => repo.createPersonWithProject(data),
    };
  } catch (e) {
    errors.push(`PersonRepository: ${e.message}`);
  }

  throw new Error(`No usable user creator found:\n  ${errors.join('\n  ')}`);
}

// Export the hooks
module.exports = {
  n8n: {
    /**
     * Called when n8n is ready
     * We use this to register custom routes for OIDC
     */
    ready: [
      async function (server, n8nConfig) {
        const missing = validateConfig();
        if (missing.length > 0) {
          console.warn(`[OIDC Hook] Missing configuration: ${missing.join(', ')}. OIDC disabled.`);
          return;
        }

        console.log('[OIDC Hook] Initializing OIDC authentication...');

        // Never let a failure here take n8n down with it.
        try {
          let sessionIssuer;
          try {
            sessionIssuer = resolveSessionIssuer();
            console.log(`[OIDC Hook] Session issuer: ${sessionIssuer.label}`);
          } catch (err) {
            console.error(`[OIDC Hook] OIDC DISABLED, n8n internals changed:\n${err.message}`);
            console.error('[OIDC Hook] n8n will still start; use email/password login until the hook is updated.');
            return;
          }

          // How will new users be created? Resolved once at startup so the log shows it.
          let userCreator = null;
          try {
            userCreator = resolveUserCreator(this.dbCollections.User);
            console.log(`[OIDC Hook] User provisioning: ${userCreator.label}`);
          } catch (err) {
            console.error(`[OIDC Hook] New-user provisioning UNAVAILABLE (existing users can still log in):\n${err.message}`);
          }

          const { app } = server;
          const cookieSecret = getCookieSecret();

          // Cookie settings
          const cookieOptions = {
            httpOnly: true,
            secure: process.env.N8N_PROTOCOL === 'https',
            sameSite: 'lax',
            maxAge: 15 * 60 * 1000, // 15 minutes
          };

          /**
           * OIDC Login endpoint - redirects to the OIDC provider
           */
          app.get('/auth/oidc/login', async (req, res) => {
            try {
              const discovery = await fetchDiscoveryDocument();

              const state = generateRandomString();
              const nonce = generateRandomString();

              // Store state and nonce in signed cookies
              const stateCookie = createSignedCookie({ state }, cookieSecret);
              const nonceCookie = createSignedCookie({ nonce }, cookieSecret);

              res.cookie('n8n-oidc-state', stateCookie, cookieOptions);
              res.cookie('n8n-oidc-nonce', nonceCookie, cookieOptions);

              // Build authorization URL
              const authUrl = new URL(discovery.authorization_endpoint);
              authUrl.searchParams.set('client_id', config.clientId);
              authUrl.searchParams.set('redirect_uri', config.redirectUri);
              authUrl.searchParams.set('response_type', 'code');
              authUrl.searchParams.set('scope', config.scopes);
              authUrl.searchParams.set('state', state);
              authUrl.searchParams.set('nonce', nonce);

              res.redirect(authUrl.toString());
            } catch (error) {
              console.error('[OIDC Hook] Login error:', error);
              res.status(500).send('OIDC configuration error. Please check the logs.');
            }
          });

          /**
           * OIDC Callback endpoint - handles the authorization code
           */
          app.get('/auth/oidc/callback', async (req, res) => {
            try {
              const { code, state, error, error_description } = req.query;

              // Handle OIDC errors
              if (error) {
                console.error('[OIDC Hook] OIDC error:', error, error_description);
                return res.redirect('/signin?error=' + encodeURIComponent(error_description || error));
              }

              if (!code || !state) {
                return res.redirect('/signin?error=' + encodeURIComponent('Missing authorization code or state'));
              }

              // Verify state
              const stateCookie = req.cookies['n8n-oidc-state'];
              const nonceCookie = req.cookies['n8n-oidc-nonce'];

              if (!stateCookie || !nonceCookie) {
                return res.redirect('/signin?error=' + encodeURIComponent('Missing state cookies - session expired'));
              }

              const statePayload = verifySignedCookie(stateCookie, cookieSecret);
              const noncePayload = verifySignedCookie(nonceCookie, cookieSecret);

              if (!statePayload || !safeEqual(statePayload.state, state)) {
                return res.redirect('/signin?error=' + encodeURIComponent('Invalid state - possible CSRF attack'));
              }

              // The nonce cookie must be valid too (previously a bad/expired one skipped the nonce check)
              if (!noncePayload) {
                return res.redirect('/signin?error=' + encodeURIComponent('Invalid or expired nonce - please try again'));
              }

              // Clear state cookies
              res.clearCookie('n8n-oidc-state');
              res.clearCookie('n8n-oidc-nonce');

              // Exchange code for tokens
              const discovery = await fetchDiscoveryDocument();
              const tokens = await exchangeCodeForTokens(code, discovery);

              // Verify nonce in ID token if present
              if (tokens.id_token) {
                const idTokenClaims = decodeJwt(tokens.id_token);
                if (idTokenClaims.nonce !== noncePayload.nonce) {
                  return res.redirect('/signin?error=' + encodeURIComponent('Invalid nonce - possible replay attack'));
                }
              }

              // Get user info
              let userInfo;
              try {
                userInfo = await fetchUserInfo(tokens.access_token, discovery);
              } catch (e) {
                // Fall back to ID token claims if userinfo endpoint fails
                if (tokens.id_token) {
                  userInfo = decodeJwt(tokens.id_token);
                } else {
                  throw e;
                }
              }

              // Validate we have an email
              if (!userInfo.email || !isValidEmail(userInfo.email)) {
                return res.redirect('/signin?error=' + encodeURIComponent('No valid email in OIDC response'));
              }

              // Refuse explicitly unverified emails (accounts are matched by email).
              // Providers that don't send email_verified at all are still accepted.
              if (userInfo.email_verified === false || userInfo.email_verified === 'false') {
                return res.redirect('/signin?error=' + encodeURIComponent('Email address not verified by the identity provider'));
              }

              // Find or create user in n8n database
              const { User, Settings, Credentials, Workflow } = this.dbCollections;

              // Try to find existing user by email
              let user = await User.findOne({
                where: { email: userInfo.email },
                relations: ['role'],
              });

              if (!user) {
                if (!userCreator) {
                  console.error('[OIDC Hook] Cannot create new user: no user creator available (see the startup log).');
                  return res.redirect('/signin?error=' + encodeURIComponent('User provisioning is unavailable (hook needs updating)'));
                }

                // Check if this is the first user (should be owner)
                const userCount = await User.count();

                const userData = {
                  email: userInfo.email,
                  firstName: userInfo.given_name || userInfo.name?.split(' ')[0] || 'User',
                  lastName: userInfo.family_name || userInfo.name?.split(' ').slice(1).join(' ') || '',
                  password: crypto.randomBytes(32).toString('hex'), // Random password, can't be used
                  role: { slug: userCount === 0 ? 'global:owner' : 'global:member' },
                };

                // Create the user and their personal project
                const result = await userCreator.create(userData);
                user = result.user;

                console.log(`[OIDC Hook] Created ${userCount === 0 ? 'owner' : 'member'} user with personal project: ${userInfo.email}`);
              }

              if (!user) {
                return res.redirect('/signin?error=' + encodeURIComponent('Failed to create or find user'));
              }

              // Issue the n8n session cookie (n8n's own issuer, or manual signing as a fallback)
              sessionIssuer.issue(res, user);

              // Redirect to home
              res.redirect('/');
            } catch (error) {
              console.error('[OIDC Hook] Callback error:', error);
              res.redirect('/signin?error=' + encodeURIComponent('Authentication failed: ' + error.message));
            }
          });

          /**
           * Serve the frontend customization script
           * This script will replace the login form with an OIDC button
           *
           * NOTE: The route must be under /assets/ or another non-UI route prefix
           * to avoid being intercepted by n8n's history API handler which would
           * serve index.html instead of our JavaScript file.
           */
          app.get('/assets/oidc-frontend-hook.js', (req, res) => {
            // Use res.type() for proper MIME type handling with nosniff
            res.type('text/javascript; charset=utf-8');
            res.set('Cache-Control', 'public, max-age=3600');
            res.send(getFrontendScript());
          });

          console.log('[OIDC Hook] OIDC routes registered:');
          console.log('  - GET /auth/oidc/login');
          console.log('  - GET /auth/oidc/callback');
          console.log('  - GET /assets/oidc-frontend-hook.js');
        } catch (err) {
          console.error('[OIDC Hook] OIDC DISABLED, unexpected error during setup:', err);
          console.error('[OIDC Hook] n8n will still start; use email/password login until the hook is updated.');
        }
      },
    ],
  },

  frontend: {
    /**
     * Modify frontend settings to configure SSO display
     * (runs before n8n.ready, so this only does a cheap resolve check)
     */
    settings: [
      async function (frontendSettings) {
        const missing = validateConfig();
        if (missing.length > 0) {
          return; // OIDC not configured, don't modify settings
        }

        if (!sessionIssuerAvailable()) {
          console.error('[OIDC Hook] No session issuer module found in n8n; not advertising SSO in the UI.');
          return;
        }

        // Enable OIDC login button by setting these properties
        // This tells the frontend that OIDC is available
        frontendSettings.sso = frontendSettings.sso || {};
        frontendSettings.sso.oidc = {
          loginEnabled: true,
          loginUrl: '/auth/oidc/login',
          callbackUrl: config.redirectUri,
        };

        // Set authentication method to OIDC so the frontend knows SSO is primary
        frontendSettings.userManagement = frontendSettings.userManagement || {};
        frontendSettings.userManagement.authenticationMethod = 'oidc';

        // Enable enterprise OIDC feature flag so the SSO button shows
        frontendSettings.enterprise = frontendSettings.enterprise || {};
        frontendSettings.enterprise.oidc = true;

        console.log('[OIDC Hook] Frontend settings configured for OIDC');
      },
    ],
  },
};

/**
 * Generate the frontend customization script
 * This script runs in the browser and customizes the login page
 */
function getFrontendScript() {
  return `
/**
 * n8n OIDC Frontend Customization
 *
 * This script surgically modifies the login form to show an SSO button.
 * To access the normal login form, add ?showLogin=true to the URL.
 */
(function() {
        'use strict';

        function shouldShowNormalLogin() {
                return new URLSearchParams(window.location.search).get('showLogin') === 'true';
        }

        function isSigninPage() {
                return window.location.pathname === '/signin' || window.location.pathname === '/login';
        }

        function displayError(form) {
                var error = new URLSearchParams(window.location.search).get('error');
                if (!error || !form || form.querySelector('#oidc-error')) return;

                var errorDiv = document.createElement('div');
                errorDiv.id = 'oidc-error';
                errorDiv.style.cssText = 'background: var(--color-danger-tint-1, #fee); border: 1px solid var(--color-danger, #fcc); color: var(--color-danger, #c00); padding: 12px; border-radius: 4px; margin: 16px 0;';
                errorDiv.textContent = decodeURIComponent(error);

                var heading = form.querySelector('div[class*="_heading_"]');
                if (heading) heading.after(errorDiv);
                else form.prepend(errorDiv);
        }

        function injectSsoButton() {
                if (shouldShowNormalLogin()) return;
                if (!isSigninPage()) return;

                var form = document.querySelector('[data-test-id="auth-form"]');
                if (!form || form.querySelector('#oidc-sso-button')) return;

                // Find existing button to clone its classes
                var existingButton = form.querySelector('[data-test-id="form-submit-button"]');
                var buttonClasses = existingButton ? existingButton.className : '';

                // Hide the form elements (inputs, buttons, forgot password)
                form.querySelectorAll('div[class*="_inputsContainer_"], div[class*="_buttonsContainer_"], div[class*="_actionContainer_"]')
                        .forEach(function(el) { el.style.display = 'none'; });

                // Create SSO button container
                var ssoContainer = document.createElement('div');
                ssoContainer.id = 'oidc-sso-container';
                ssoContainer.style.cssText = 'text-align: center;';

                // Create button - use cloned classes or fallback styles
                var button = document.createElement('button');
                button.id = 'oidc-sso-button';
                button.type = 'button';
                button.textContent = 'Sign in with SSO';
                button.onclick = function() { window.location.href = '/auth/oidc/login'; };

                if (buttonClasses) {
                        button.className = buttonClasses;
                        button.style.width = '100%';
                } else {
                        button.style.cssText = 'width: 100%; padding: 12px 24px; font-size: 14px; font-weight: 600; color: white; background: var(--color-primary, #ea4b30); border: none; border-radius: 4px; cursor: pointer;';
                }

                // Create admin link
                var adminLink = document.createElement('p');
                adminLink.style.cssText = 'margin-top: 16px; font-size: 12px; color: var(--color-text-light, #666);';
                adminLink.innerHTML = 'Admin? <a href="?showLogin=true" style="color: var(--color-primary, #ea4b30);">Sign in with email</a>';

                ssoContainer.appendChild(button);
                ssoContainer.appendChild(adminLink);

                // Insert after the heading
                var heading = form.querySelector('div[class*="_heading_"]');
                if (heading) heading.after(ssoContainer);
                else form.prepend(ssoContainer);

                displayError(form);
        }

        function observeAndInject() {
                if (shouldShowNormalLogin() || !isSigninPage()) return;

                injectSsoButton();

                var observer = new MutationObserver(function() {
                        if (isSigninPage() && !shouldShowNormalLogin()) {
                                var form = document.querySelector('[data-test-id="auth-form"]');
                                if (form && !form.querySelector('#oidc-sso-button')) {
                                        injectSsoButton();
                                }
                        }
                });

                observer.observe(document.body, { childList: true, subtree: true });
                setTimeout(function() { observer.disconnect(); }, 10000);
        }

        function handleNavigation() {
                var origPush = history.pushState;
                var origReplace = history.replaceState;

                history.pushState = function() {
                        origPush.apply(this, arguments);
                        setTimeout(observeAndInject, 100);
                };

                history.replaceState = function() {
                        origReplace.apply(this, arguments);
                        setTimeout(observeAndInject, 100);
                };

                window.addEventListener('popstate', function() {
                        setTimeout(observeAndInject, 100);
                });
        }

        if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function() {
                        observeAndInject();
                        handleNavigation();
                });
        } else {
                observeAndInject();
                handleNavigation();
        }

        setTimeout(observeAndInject, 500);
        setTimeout(observeAndInject, 1000);

        console.log('[OIDC Hook] Frontend customization loaded');
})();
`;
}
