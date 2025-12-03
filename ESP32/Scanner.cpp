// AutoAttend ESP32 scanner: posts hex values from BLE advertisements to our Worker API
#include <Arduino.h>
#include <BLEDevice.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Update.h>
#include <cstdio>
#include <set>
#include <algorithm>
#include <map>

// ✅ Target UUID to search for (case-insensitive)
const char* TARGET_UUID = "D7E1A3F4";

// --- CONFIG: Update these for your network & AutoAttend server ---
// const char* WIFI_SSID = "Airtel_mayu_7965";
// const char* WIFI_PASS = "Air@52077";

// const char* WIFI_SSID = "Ruchi Salaskar";
// const char* WIFI_PASS = "tjou1662";

// const char* WIFI_SSID = "iPhone";
// const char* WIFI_PASS = "qwertyui";

const char* WIFI_SSID = "Zoo_Studio_2.4";
const char* WIFI_PASS = "Trh@1234";
// IMPORTANT: set this to the machine running the dev server (same network)
// Example if your laptop's IP is 192.168.1.50 and Vite dev uses 5175:
//   http://192.168.1.50:5175
const char* SERVER_HOST = "http://192.168.2.177:5175"; 
const char* SERVER_ENDPOINT = "/api/esp32/detect"; // Worker endpoint (hex only)
// OTA endpoints
const char* OTA_MANIFEST_PATH = "/api/ota/manifest"; // returns JSON manifest
// Build-time firmware version of this device
static const char* CURRENT_FIRMWARE_VERSION = "1.0.0";
// How often to check for updates (seconds)
static const uint32_t OTA_CHECK_INTERVAL_SECONDS = 600; // 10 minutes
static uint32_t nextOtaCheck = 0;

// How long to ignore repeat POSTs for the same event (seconds)
const uint32_t SEEN_TTL_SECONDS = 10;

// Presence/timeout configuration
// If we haven't seen a device for this many seconds, treat it as "left the office"
const uint32_t PRESENCE_TIMEOUT_SECONDS = 30;

// lastSeenAt: detection timestamp for each hex payload (seconds)
static std::map<std::string, uint32_t> lastSeenAt; // hex -> last seen epoch seconds

// lastSentAt: last time we POSTed this hex to Strapi (seconds) used for dedupe
static std::map<std::string, uint32_t> lastSentAt; // hex -> last POST epoch seconds

// Devices currently considered present (we've sent an "enter" for them)
static std::set<std::string> presentDevices;

#define MAX_DEVICES 5  // Limit number of tracked devices to prevent memory issues
static std::set<std::string> devicesWithTarget;

// Helper: convert string to lowercase (with memory limit)
std::string toLowerCase(const std::string &str) {
  if (str.length() > 64) return str.substr(0, 64); // Prevent excessive memory use
  std::string lower = str;
  std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);
  return lower;
}

// Helper: convert binary data to HEX string
std::string toHexString(const uint8_t* data, size_t length) {
  static const char hexChars[] = "0123456789ABCDEF";
  std::string hex;
  hex.reserve(length * 2);
  for (size_t i = 0; i < length; i++) {
    unsigned char c = data[i];
    hex += hexChars[(c >> 4) & 0x0F];
    hex += hexChars[c & 0x0F];
  }
  return hex;
}

// Overload for std::string input
std::string toHexString(const std::string &input) {
  return toHexString((const uint8_t*)input.data(), input.size());
}

bool isAsciiHexString(const std::string &s) {
  if (s.empty() || (s.length() % 2) != 0) return false;
  for (char c : s) {
    if (!isxdigit((unsigned char)c)) return false;
  }
  return true;
}

// Helper: check if server response indicates success
bool wasPostSuccessful(const String &response) {
  // Our Worker returns { success: true, ... } or { success: true, deduped: true }
  return response.indexOf("\"success\":true") >= 0 ||
         response.indexOf("\"deduped\":true") >= 0;
}

// Internal helper to POST with action ("checkin" or "checkout")
void sendHexToServerWithAction(const std::string &hexValue, const char* action) {
  static const int MAX_RETRIES = 3;  // Maximum number of retry attempts
  
  // dedupe by lastSentAt TTL
  uint32_t nowSec = millis() / 1000;
  auto it = lastSentAt.find(hexValue);
  if (it != lastSentAt.end()) {
    if ((nowSec - it->second) < SEEN_TTL_SECONDS) {
      Serial.println("Ignoring duplicate POST (recent): " + String(hexValue.c_str()));
      return;
    }
  }
  lastSentAt[hexValue] = nowSec;

  int retries = 0;
  while (retries < MAX_RETRIES) {
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("⚠️ WiFi not connected; waiting 2s before retry...");
      delay(2000);
      if (retries == MAX_RETRIES - 1) {
        Serial.println("❌ WiFi connection failed after retries");
        presentDevices.erase(hexValue);  // Allow future retry
        return;
      }
      retries++;
      continue;
    }

  String url = String(SERVER_HOST) + String(SERVER_ENDPOINT);
    HTTPClient http;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
  // Build payload {"hex_value":"...", "action":"checkin|checkout"}
  String payload = String("{\"hex_value\":\"") + String(hexValue.c_str()) + String("\",\"action\":\"") + String(action) + String("\"}");
  Serial.printf("📡 POSTing to AutoAttend (attempt %d/%d): %s\n", retries + 1, MAX_RETRIES, payload.c_str());
    
    int code = http.POST(payload);
    String resp = http.getString();
    
    if (code == 200 || code == 201) {
      if (wasPostSuccessful(resp)) {
  Serial.println("✅ Server confirmed success");
        Serial.printf("Response: %s\n", resp.c_str());
        http.end();
        return;  // Success!
      } else {
        Serial.println("⚠️ Unexpected response format");
        Serial.printf("Response: %s\n", resp.c_str());
      }
    } else {
      Serial.printf("❌ Error: POST failed with code %d\n", code);
      Serial.printf("Response: %s\n", resp.c_str());
    }
    
    http.end();
    
    // If we get here, either the response wasn't successful or the status code wasn't 200/201
    retries++;
    if (retries < MAX_RETRIES) {
      int backoff = 1000 * retries;  // Exponential backoff: 1s, 2s, 3s
      Serial.printf("⏳ Retry %d/%d after %dms\n", retries + 1, MAX_RETRIES, backoff);
      delay(backoff);
    }
  }
  
  // If we get here, we failed after all retries
  Serial.printf("❌ Failed to POST after %d attempts\n", MAX_RETRIES);
  presentDevices.erase(hexValue);  // Remove from tracking to allow future retry
}

// Send a single hex_value (ASCII hex string) as a check-in (default)
void sendHexToServer(const std::string &hexValue) {
  sendHexToServerWithAction(hexValue, "checkin");
}

// Minimal JSON escaper for strings we send to Strapi
static std::string jsonEscape(const std::string &s) {
  std::string out;
  out.reserve(s.size() * 2);
  for (unsigned char c : s) {
    switch (c) {
      case '\\': out += "\\\\"; break;
      case '"': out += "\\\""; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (c < 0x20) {
          char buf[7];
          // produce unicode escape for control characters
          snprintf(buf, sizeof(buf), "\\u%04x", c);
          out += buf;
        } else {
          out += (char)c;
        }
    }
  }
  return out;
}

// Send service data (ASCII) to AutoAttend as {"hex_value":"..."}
// Note: if serviceAscii is already ASCII hex, we use it as-is; otherwise we send its HEX.
void sendServiceDataToServer(const std::string &serviceAscii) {
  uint32_t nowSec = millis() / 1000;
  auto it = lastSentAt.find(serviceAscii);
  if (it != lastSentAt.end()) {
    if ((nowSec - it->second) < SEEN_TTL_SECONDS) {
      Serial.println("Ignoring duplicate service data (recent): " + String(serviceAscii.c_str()));
      return;
    }
  }
  lastSentAt[serviceAscii] = nowSec;

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected; cannot POST service data");
    return;
  }

  String url = String(SERVER_HOST) + String(SERVER_ENDPOINT);
  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
 
  // Determine hex to send
  String payload;
  if (isAsciiHexString(serviceAscii)) {
    payload = String("{\"hex_value\":\"") + String(serviceAscii.c_str()) + String("\"}");
  } else {
    std::string hexS = toHexString(serviceAscii);
    payload = String("{\"hex_value\":\"") + String(hexS.c_str()) + String("\"}");
  }
  Serial.println("POSTing service data to AutoAttend: " + payload);
  int code = http.POST(payload);
  String resp = http.getString();
  Serial.printf("AutoAttend service POST code=%d\n", code);
  Serial.println("AutoAttend response: " + resp);
  http.end();
}

// BLE Callback
class MyAdvertisedDeviceCallbacks : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice advertisedDevice) override {
    std::string addr = advertisedDevice.getAddress().toString();
    std::string targetLower = toLowerCase(TARGET_UUID);
    bool matches = false;
    std::string foundUuidStr;

    // 1️⃣ Check for Service UUID match
    if (advertisedDevice.haveServiceUUID()) {
      std::string srv = advertisedDevice.getServiceUUID().toString();
      if (toLowerCase(srv).find(targetLower) != std::string::npos) {
        matches = true;
        foundUuidStr = srv;
      }
    }

    // 2️⃣ Check Manufacturer Data for UUID (Android often uses this)
    if (!matches && advertisedDevice.haveManufacturerData()) {
      std::string mData = advertisedDevice.getManufacturerData();
      std::string mDataHex = toHexString(mData);
      if (toLowerCase(mDataHex).find(targetLower) != std::string::npos) {
        matches = true;
        foundUuidStr = TARGET_UUID;
      }
    }

    // 3️⃣ Check Service Data for UUID
    if (!matches && advertisedDevice.haveServiceData()) {
      try {
        std::string sData = advertisedDevice.getServiceData();
        std::string sDataHex = toHexString(sData);
        if (toLowerCase(sDataHex).find(targetLower) != std::string::npos) {
          matches = true;
          foundUuidStr = TARGET_UUID;
        }
      } catch (...) {
        // ignore service data parsing errors
      }
    }

    // 4️⃣ Fallback: check complete advertisement text
    if (!matches) {
      std::string advStr = advertisedDevice.toString();
      if (toLowerCase(advStr).find(targetLower) != std::string::npos) {
        matches = true;
        foundUuidStr = TARGET_UUID;
      }
    }

    // 3️⃣ Process only if target UUID matches
    if (matches) {
      if (devicesWithTarget.insert(addr).second) {
        Serial.println("==================================");
  Serial.printf("📡 Device: %s\n", addr.c_str());
  Serial.printf("  Matched UUID: %s\n", foundUuidStr.c_str());

        // --- Service UUID ---
        if (advertisedDevice.haveServiceUUID()) {
          Serial.printf("  Service UUID: %s\n", advertisedDevice.getServiceUUID().toString().c_str());
        }

        // --- Manufacturer Data ---
        if (advertisedDevice.haveManufacturerData()) {
          std::string mData = advertisedDevice.getManufacturerData();
          Serial.printf("  Manufacturer Data (HEX): %s\n", toHexString(mData).c_str());
        }

    // --- Service Data (simplified and safer) ---
    if (advertisedDevice.haveServiceData()) {
      try {
        std::string sData = advertisedDevice.getServiceData(); // get service data blob
        if (!sData.empty()) {
          // Print hex and ASCII versions
          std::string hexS = toHexString(sData);
          Serial.printf("  Service Data (HEX): %s\n", hexS.c_str());
          std::string ascii;
          for (char c : sData) if (isprint((unsigned char)c)) ascii += c;
          if (!ascii.empty()) Serial.printf("  Service Data (ASCII): %s\n", ascii.c_str());

          // If ASCII part itself looks like a hex string (even length, hex chars), treat it as payload
                    if (isAsciiHexString(ascii)) {
            Serial.printf("  -> Detected ASCII-HEX payload in Service Data: %s\n", ascii.c_str());
            // handle detection (presence logic)
            std::string h = ascii;
            lastSeenAt[h] = millis() / 1000;
            if (presentDevices.find(h) == presentDevices.end()) {
              // Not present yet -> mark present and send enter
              presentDevices.insert(h);
              sendHexToServer(h);
            }
          } else {
            // Otherwise, if binary data exists, send its HEX form
            if (!hexS.empty()) {
              // Some advertisers may send the hex payload as raw bytes; send hexS
              std::string h = hexS;
              lastSeenAt[h] = millis() / 1000;
              if (presentDevices.find(h) == presentDevices.end()) {
                presentDevices.insert(h);
                sendHexToServer(h);
              }
            }
          }
        }
      } catch (...) {
        // ignore service data parsing errors
      }
    }

        // --- Raw advertisement payload with parsing ---
        uint8_t* payload = advertisedDevice.getPayload();
        int payloadLength = advertisedDevice.getPayloadLength();
        std::string hexData = toHexString(payload, payloadLength);
        
  // Raw adv data length and full hex are intentionally omitted per user request

        // --- Parse AD structures to find Local Name (kCBAdvDataLocalName) ---
        // Advertisement data is a sequence of [len][type][data...] TLV entries
        if (payloadLength > 0) {
          int idx = 0;
          bool foundLocalName = false;
          while (idx < payloadLength) {
            uint8_t len = payload[idx];
            if (len == 0) break; // no more AD structures
            if (idx + len >= payloadLength) break; // malformed/truncated

            uint8_t type = payload[idx + 1];
            // 0x08 = Shortened Local Name, 0x09 = Complete Local Name
                if (type == 0x08 || type == 0x09) {
              int nameLen = len - 1; // excluding type byte
              if (nameLen > 0) {
                std::string name;
                name.reserve(nameLen);
                for (int j = 0; j < nameLen; ++j) {
                  name += (char)payload[idx + 2 + j];
                }
                Serial.printf("  Local Name (ASCII): %s\n", name.c_str());
                std::string nameHex = toHexString((const uint8_t*)name.data(), name.size());
                Serial.printf("  Local Name (HEX): %s\n", nameHex.c_str());
                // If the local name itself is an ASCII hex string, handle detection (presence)
                if (isAsciiHexString(name)) {
                    Serial.printf("  -> Detected Local Name ASCII-HEX payload: %s\n", name.c_str());
                    std::string h = name;
                    lastSeenAt[h] = millis() / 1000;
                    if (presentDevices.find(h) == presentDevices.end()) {
                      presentDevices.insert(h);
                      sendHexToServer(h);
                    }
                }
                foundLocalName = true;
                // keep searching in case other entries exist
              }
            }

            idx += (1 + len); // length byte + len bytes
          }

          if (!foundLocalName) {
            Serial.println("  Local Name: <not present>");
          }
        }
        
        // Known parts of the advertisement:
        // 02011A020A0B1107FB349B5F8000008000100000F4A3E1D7 (24 bytes: BLE header + UUID)
        // Following that should be the encrypted email data
        
        const int MINIMUM_HEADER_SIZE = 24; // Size of BLE header + UUID
        if (payloadLength > MINIMUM_HEADER_SIZE) {
            // Extract just the payload part after the header
            std::string payloadData = hexData.substr(MINIMUM_HEADER_SIZE * 2); // *2 because hex string
            Serial.printf("  Payload Data (HEX): %s\n", payloadData.c_str());
            Serial.printf("  Payload Length: %d bytes\n", (payloadLength - MINIMUM_HEADER_SIZE));
            
            // Try to decode as ASCII (might help identify the email portion)
            std::string ascii;
            for (int i = MINIMUM_HEADER_SIZE; i < payloadLength; i++) {
                char c = payload[i];
                if (isprint(c)) ascii += c;
            }
            if (!ascii.empty()) {
                Serial.printf("  Payload (ASCII): %s\n", ascii.c_str());
            }
        } else {
            Serial.println("  ⚠️ Basic advertisement only (no payload data)");
        }

        Serial.println("  ✅ Target UUID MATCH FOUND");
        Serial.println("==================================");
      }
    }
  }
};

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("Starting BLE Scanner (only scanning for D7E1A3F4)...");
  // Connect to WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to WiFi");
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print('.');
    delay(500);
    if ((millis() - start) > 20000) break;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi connected: " + WiFi.localIP().toString());
  } else {
    Serial.println("WiFi not connected; will still scan but cannot POST until connected");
  }

  BLEDevice::init("ESP32_BLE_Scanner");
}

void loop() {
  devicesWithTarget.clear();

  static MyAdvertisedDeviceCallbacks myCallbacks;
  BLEScan* pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(&myCallbacks, false);
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(99);

  int scanTime = 2;  // scan for 2 seconds (reduced from 3 to make total cycle closer to 5-6 seconds)
  Serial.println("\n🔍 Scanning for BLE devices advertising D7E1A3F4...");
  pBLEScan->start(scanTime, false);
  pBLEScan->stop();

  Serial.printf("\n✅ Scan complete. Found %d matching device(s):\n", (int)devicesWithTarget.size());
  for (auto &mac : devicesWithTarget) {
    Serial.printf("   - %s\n", mac.c_str());
  }
  // After scanning, check for devices that have timed out (left the office)
  uint32_t nowSec = millis() / 1000;
  std::vector<std::string> toRemove;
  for (const auto &h : presentDevices) {
    auto it = lastSeenAt.find(h);
    if (it == lastSeenAt.end()) continue;
    if ((nowSec - it->second) > PRESENCE_TIMEOUT_SECONDS) {
      // Device considered departed: POST a checkout event
      Serial.printf("Device %s timed out (no longer seen). Posting checkout...\n", h.c_str());
      sendHexToServerWithAction(h, "checkout");
      toRemove.push_back(h);
    }
  }
  for (const auto &r : toRemove) {
    presentDevices.erase(r);
    lastSeenAt.erase(r);
  }

  Serial.println("⏳ Waiting 4 seconds before next scan...\n");
  delay(4000);  // 4 second delay + 2 second scan = ~6 second total cycle

  // OTA periodic check
  uint32_t nowSec = millis() / 1000;
  if (WiFi.status() == WL_CONNECTED && nowSec >= nextOtaCheck) {
    nextOtaCheck = nowSec + OTA_CHECK_INTERVAL_SECONDS;
    checkForOtaUpdate();
  }
}

// ----------------------- OTA Support -----------------------
void checkForOtaUpdate() {
  Serial.println("\n🔄 Checking OTA manifest...");
  String url = String(SERVER_HOST) + String(OTA_MANIFEST_PATH);
  HTTPClient http;
  http.begin(url);
  int code = http.GET();
  if (code != 200) {
    Serial.printf("⚠️ OTA manifest fetch failed code=%d\n", code);
    http.end();
    return;
  }
  String json = http.getString();
  http.end();
  // Very minimal JSON parsing (avoid full parser): look for "version":"X"
  int vIdx = json.indexOf("\"version\"");
  if (vIdx < 0) { Serial.println("⚠️ Manifest missing version field"); return; }
  int colon = json.indexOf(':', vIdx);
  int quoteStart = json.indexOf('"', colon + 1);
  int quoteEnd = json.indexOf('"', quoteStart + 1);
  if (quoteStart < 0 || quoteEnd < 0) { Serial.println("⚠️ Unable to parse version"); return; }
  String remoteVersion = json.substring(quoteStart + 1, quoteEnd);
  if (remoteVersion.length() == 0) { Serial.println("⚠️ Empty remote version"); return; }
  Serial.printf("Manifest version=%s current=%s\n", remoteVersion.c_str(), CURRENT_FIRMWARE_VERSION);
  if (remoteVersion == CURRENT_FIRMWARE_VERSION) {
    Serial.println("✅ Firmware up to date");
    return;
  }
  Serial.println("⬆️ New firmware available, starting download...");
  // Parse key field for download path
  int kIdx = json.indexOf("\"key\"");
  String key;
  if (kIdx >= 0) {
    int kColon = json.indexOf(':', kIdx);
    int kQuoteStart = json.indexOf('"', kColon + 1);
    int kQuoteEnd = json.indexOf('"', kQuoteStart + 1);
    if (kQuoteStart > 0 && kQuoteEnd > kQuoteStart) {
      key = json.substring(kQuoteStart + 1, kQuoteEnd);
    }
  }
  String downloadUrl;
  if (key.length() > 0) {
    downloadUrl = String(SERVER_HOST) + String("/api/ota/download?key=") + key;
  } else {
    // fallback to manifest-based download (no key param)
    downloadUrl = String(SERVER_HOST) + String("/api/ota/download");
  }
  applyFirmware(downloadUrl, remoteVersion);
}

bool applyFirmware(const String &url, const String &newVersion) {
  Serial.printf("📥 Downloading firmware from %s\n", url.c_str());
  HTTPClient http;
  http.begin(url);
  int code = http.GET();
  if (code != 200) {
    Serial.printf("❌ Firmware download failed code=%d\n", code);
    http.end();
    return false;
  }
  int contentLength = http.getSize();
  WiFiClient * stream = http.getStreamPtr();
  if (contentLength <= 0) {
    Serial.println("❌ Invalid content length for firmware");
    http.end();
    return false;
  }
  Serial.printf("Firmware size: %d bytes\n", contentLength);
  if (!Update.begin(contentLength)) { // allocate space
    Serial.println("❌ Update.begin failed");
    http.end();
    return false;
  }
  size_t written = 0;
  uint8_t buff[1024];
  while (http.connected() && (written < (size_t)contentLength)) {
    size_t avail = stream->available();
    if (avail) {
      if (avail > sizeof(buff)) avail = sizeof(buff);
      int readLen = stream->readBytes(buff, avail);
      if (readLen > 0) {
        if (Update.write(buff, readLen) != (size_t)readLen) {
          Serial.println("❌ Update write failed");
          Update.abort();
          http.end();
          return false;
        }
        written += readLen;
      }
    }
    delay(1);
  }
  if (written != (size_t)contentLength) {
    Serial.printf("❌ Written %d bytes but expected %d\n", (int)written, contentLength);
    Update.abort();
    http.end();
    return false;
  }
  if (!Update.end()) {
    Serial.printf("❌ Update.end failed error=%d\n", Update.getError());
    http.end();
    return false;
  }
  if (!Update.isFinished()) {
    Serial.println("❌ Update not finished");
    http.end();
    return false;
  }
  Serial.println("✅ Firmware updated successfully. Rebooting...");
  http.end();
  delay(1000);
  ESP.restart();
  return true;
}