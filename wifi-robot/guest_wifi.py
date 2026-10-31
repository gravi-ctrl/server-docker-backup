#!/usr/bin/env python3
# @DESCRIPTION: Selenium bot to toggle Guest WiFi via TP-Link Router.
# @FREQUENCY: On Demand (Telegram - through n8n)
import os
import sys
import threading
import time

from dotenv import load_dotenv
from flask import Flask, jsonify
from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from waitress import serve

# --- CONFIGURATION ---
# Load environment variables from .env file (if present)
load_dotenv()

# Get secrets from Environment
ROUTER_IP = os.getenv("ROUTER_IP", "192.168.1.1") # Default to 1.1 if missing
ROUTER_PASSWORD = os.getenv("ROUTER_PASSWORD")
APP_PORT = 5000

# Safety Check
if not ROUTER_PASSWORD:
    print("❌ Error: ROUTER_PASSWORD not found in environment variables.")
    sys.exit(1)

# Initialize Web Server
app = Flask(__name__)

# The router only allows one admin session, so never run two browsers at once.
# Concurrent requests queue up here instead of fighting over the login.
router_lock = threading.Lock()

# --- Element IDs ---
PASSWORD_FIELD_ID = "pc-login-password"
LOGIN_BUTTON_ID = "pc-login-btn"
FORCE_LOGIN_BUTTON_ID = "confirm-yes"
GUEST_NETWORK_MENU_ID = "guestNtw"
LOGOUT_BUTTON_ID = "topLogout"
GUEST_WIFI_TOGGLE_ID = "wlEn_2g"
SAVE_BUTTON_ID = "save"

def set_guest_wifi(enable=True):
    options = ChromeOptions()
    options.binary_location = "/usr/bin/chromium"
    options.add_argument("--headless=new")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument('--log-level=3')

    driver = None
    status_msg = ""

    try:
        print("Starting Chrome...")
        driver = webdriver.Chrome(service=ChromeService("/usr/bin/chromedriver"), options=options)
        wait = WebDriverWait(driver, 15)
        short_wait = WebDriverWait(driver, 3)

        driver.set_page_load_timeout(30)

        print(f"Connecting to http://{ROUTER_IP}...")
        driver.get(f"http://{ROUTER_IP}")

        # Login
        wait.until(EC.presence_of_element_located((By.ID, PASSWORD_FIELD_ID))).send_keys(ROUTER_PASSWORD)
        wait.until(EC.element_to_be_clickable((By.ID, LOGIN_BUTTON_ID))).click()

        # Handle Popup
        try:
            force_login_button = short_wait.until(EC.element_to_be_clickable((By.ID, FORCE_LOGIN_BUTTON_ID)))
            force_login_button.click()
        except TimeoutException:
            pass  # No "already logged in" popup appeared; nothing to confirm

        # Navigate
        wait.until(EC.element_to_be_clickable((By.ID, GUEST_NETWORK_MENU_ID))).click()

        # Check State
        guest_wifi_checkbox = wait.until(EC.presence_of_element_located((By.ID, GUEST_WIFI_TOGGLE_ID)))
        is_currently_on = guest_wifi_checkbox.is_selected()

        target_state = "ON" if enable else "OFF"

        if (enable and not is_currently_on) or (not enable and is_currently_on):
            print(f"Switching WiFi to {target_state}...")
            # Click the label to toggle
            visual_checkbox_icon = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, f"label[for='{GUEST_WIFI_TOGGLE_ID}']")))
            driver.execute_script("arguments[0].scrollIntoView(true);", visual_checkbox_icon)
            time.sleep(0.5)
            driver.execute_script("arguments[0].click();", visual_checkbox_icon)

            # Save
            time.sleep(1)
            save_button = wait.until(EC.element_to_be_clickable((By.ID, SAVE_BUTTON_ID)))
            driver.execute_script("arguments[0].click();", save_button)
            status_msg = f"Success: Guest WiFi turned {target_state}"
        else:
            status_msg = f"No Change: Guest WiFi was already {target_state}"

        # Logout
        time.sleep(3)
        wait.until(EC.element_to_be_clickable((By.ID, LOGOUT_BUTTON_ID))).click()

    except Exception as e:  # noqa: BLE001 - report any failure back to the HTTP caller
        status_msg = f"Error: {e!s}"
        print(status_msg)
    finally:
        if driver:
            driver.quit()

    return status_msg

# --- WEB ROUTES ---

def run(enable, action):
    with router_lock:
        result = set_guest_wifi(enable=enable)
    code = 500 if result.startswith("Error") else 200
    return jsonify({"status": result, "action": action}), code

@app.route('/on', methods=['GET', 'POST'])
def turn_on():
    return run(True, "ON")

@app.route('/off', methods=['GET', 'POST'])
def turn_off():
    return run(False, "OFF")

@app.route('/health', methods=['GET'])
def health():
    return "ok"

@app.route('/', methods=['GET'])
def home():
    return "Wifi Robot is Online. Use /on or /off endpoints."

if __name__ == '__main__':
    # Run the web server on port 5000
    print(f"Starting Web Server on port {APP_PORT}")
    # One thread is enough (requests are serialized anyway); a few extra let
    # /health and queued requests be accepted while a toggle is running.
    serve(app, host='0.0.0.0', port=APP_PORT, threads=4)
