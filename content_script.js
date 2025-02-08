// const CONSTANTS = require("./constants");
// import * as CONSTANTS from "./constants";

let CONSTANTS = {};

(async () => {
  const src = chrome.runtime.getURL("constants.js");
  CONSTANTS = await import(src);
  console.log({ CONSTANTS: CONSTANTS.DOMAIN });
})();

/**
 * This has access to main browser DOM context
 */

const matchingDomain =
  window.location.hostname.indexOf(CONSTANTS.DOMAIN) !== -1;

const logMessage = (message, args) => {
  if (!matchingDomain) return;
  if (args) {
    console.log(message, args);
  } else {
    console.log(message);
  }
};

const tableMessage = (message, args) => {
  if (!matchingDomain) return;
  console.table(message, args);
};

const FILTER_CONFIGS = [
  { id: "global_pause", desc: "PAUSE ALL", value: false, context: "response" },
  {
    id: "errors_only",
    desc: "Show errors only",
    value: true,
    context: "response",
  },
  { id: "hide_options", desc: "Hide OPTIONS", value: true, context: "method" },
  { id: "hide_images", desc: "Hide images", value: true, context: "url" },
  { id: "hide_smetrics", desc: "Hide Onmiture", value: true, context: "url" },
];

// Remove noise
if (matchingDomain) {
  logMessage(`FILTER_CONFIGS (defaults): ${FILTER_CONFIGS.length}`);
  tableMessage(FILTER_CONFIGS);
}

FILTER_CONFIGS.forEach(async (fc, index) => {
  logMessage(`Loading ${index}/${FILTER_CONFIGS.length} from storage`);
  await chrome.storage.sync.get(fc.id, function (data) {
    fc.value = data[fc.id];
    tableMessage(fc);
  });
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  for (const [key, { oldValue, newValue }] of Object.entries(changes)) {
    logMessage(
      `FILTER_CONFIGS[${key}] in namespace "${namespace}" changed. key: ${key}`,
      `Changed "${oldValue}" -> "${newValue}".`
    );
    FILTER_CONFIGS.forEach((fc) => {
      if (fc.id === key) {
        fc.value = newValue; // Updating FILTER_CONFIGS[X]
      }
    });
  }
  logMessage("FILTER_CONFIGS reloaded... after updates");
  tableMessage(FILTER_CONFIGS);
});

document.addEventListener("click", (event) => {
  if (!matchingDomain) return;

  const imgSrc =
    event.target.nodeName === "IMG" ? event.target.attributes.src.value : null;
  const attributes = event.target.attributes;
  const methodNode = attributes["data-method"];
  const mimeTypeNode = attributes["data-mime-type"];
  const requestNode = attributes["data-request"];
  const responseNode = attributes["data-response"];
  const urlNode = attributes["data-url"];
  chrome.runtime.sendMessage(
    {
      attributes: [...attributes].map((a) => `${a.name}: ${a.value}`), // attributes as array of strings
      click: true,
      imgSrc,
      method: methodNode?.textContent,
      mimeType: mimeTypeNode?.textContent,
      origin: "contentscript::click",
      requestBody: requestNode?.textContent,
      responseBody: responseNode?.textContent,
      url: urlNode?.textContent,
      xPosition: event.clientX + document.body.scrollLeft,
      yPosition: event.clientY + document.body.scrollTop,
    },

    (response) => {
      logMessage("Received response", response);
    }
  );

  // Skip copying undefined to clipboard if not part of request
  if (!requestNode) return;

  // COPY request BODY here
  const requestText = requestNode?.textContent;
  try {
    navigator.clipboard.writeText(requestText).then(function () {
      logMessage(`Copied BODY: ${requestText?.substring(0, 60)}...`);
    });
  } catch (err) {
    console.error(`Failed to copy: ${err}`);
  }
});

/**
 * @param {string} payload
 * @returns true when error is detected
 */
function isError({ payload }) {
  const json = parseJSON(payload);
  if (json === payload) return false; // Not a JSON response
  // TODO: check for error here
  const MATCHING_ERRORS = false; // e.g. json.errors?.length > 0
  return MATCHING_ERRORS;
}

/**
 * Helper function that TEXT -> OBJECT, handles JSON parsing with error handling
 * @param {string} text
 * @returns JSON object OR original text
 */
function parseJSON(text) {
  let result = text;
  try {
    result = JSON.parse(text);
  } catch {}
  return result;
}

/**
 * Helper function that returns network request type by URL path
 * @param {string} url
 * @param {string} mimeType
 * @returns type in string
 */
function getRequestType({ url, mimeType }) {
  if (!url) return "";
  return mimeType.indexOf("image/") !== -1
    ? "img"
    : url.indexOf("/api") !== -1
    ? "api"
    : url.indexOf("/some_path_check") !== -1
    ? "some_path_check"
    : "N/A";
}

/**
 * Upon receipt of response message
 */
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  const { origin, request, response, requestBody, responseBody } = message;

  if (origin === "devtools::clearAll") {
    document
      .querySelectorAll(".my-message-panel-item")
      .forEach((e) => e.remove());
  }
  const panelItemDiv = document.createElement("div");
  panelItemDiv.className = "my-message-panel-item";

  const method = request.method.padEnd(7, " ");
  const statusCode = response?.status;
  const url = request.url;
  const mimeType = response.content.mimeType;

  for (let i = 0; i < FILTER_CONFIGS.length; i++) {
    const { context, id, value } = FILTER_CONFIGS[i];
    if (id === "global_pause" && value) {
      // GLOBAL OFF SWITCH
      return;
    }
    switch (context) {
      case "method": {
        if (id === "hide_options" && value && method === "OPTIONS") return;
        break;
      }
      case "url": {
        if (id === "hide_images" && value && mimeType.indexOf("image") !== -1)
          return;
        if (
          id === "hide_smetrics" &&
          value &&
          url.indexOf("https://smetrics.redbox.com") !== -1
        )
          return;
        break;
      }
      case "response": {
        if (
          id === "errors_only" &&
          value &&
          isError({ payload: responseBody }) === false
        )
          return;
        break;
      }
      default:
        break;
    }
  }

  if (isError({ payload: responseBody })) {
    panelItemDiv.classList.add("panel-item-error");
  }

  const requestType = getRequestType({ url, mimeType });
  const itemDiv = document.createElement("pre");
  itemDiv.innerText = `${requestType.padEnd(
    7,
    " "
  )} ${statusCode} ${method} ${url}`;

  // ONLY set attribute if exists
  method && itemDiv.setAttribute("data-method", method);
  mimeType && itemDiv.setAttribute("data-mime-type", mimeType);
  requestBody && itemDiv.setAttribute("data-request", requestBody);
  responseBody && itemDiv.setAttribute("data-response", responseBody);
  url && itemDiv.setAttribute("data-url", url);

  panelItemDiv.appendChild(itemDiv);

  // Attach to Panel, update style, make panel visible
  const messagePanel = document.querySelector("dialog.rb-video-dialog");
  messagePanel.appendChild(panelItemDiv);
  messagePanel.classList.add("my-message-panel");
  // CLEAR
  messagePanel.onclick = (e) => {
    // e.target.style.display = 'none';
    e.target.onclick = null;
  };
  panelItemDiv.scrollIntoView();

  // Inject custom style onto DOM
  const styleElement = document.createElement("style");
  const myStyle = `
      .panel-item-error {
        color: red;
      }    
      .my-message-panel-item {
        animation: fadeIn 1s;
        border-bottom: solid 1px red;
      }
      .my-message-panel-item:hover {
        background-color: black;
        color: white;
      }
      .my-message-panel-item pre {
        margin: 0.2em 0.5em;
      }
      @keyframes fadeIn {
        0% { opacity: 0; color: white; }
        100% { opacity: 1; color: black; }
      }
      .my-message-panel {
        background: #ccc;
        border-radius: 15px;
        border: solid 5px purple;
        color: black;
        cursor: pointer;
        display: block !important;
        font-family: monospace;
        margin: 10px;
        opacity: 0.9;
        overflow-y: scroll;
        height: fit-content;
        max-height: 250px;
        width: fit-content;
        z-index: 98;
      }
    `;
  styleElement.innerHTML = myStyle;
  styleElement.type = "text/css";
  if (!isStyleAlreadyInjected(myStyle)) {
    document.head.appendChild(styleElement);
  }
});

/**
 *
 * @param {string} cssText CSS style to check
 * @returns true if already defined on DOM
 */
function isStyleAlreadyInjected(cssText) {
  const existingStyleElement = document.querySelector('style[type="text/css"]');
  return (
    existingStyleElement && existingStyleElement.innerHTML.includes(cssText)
  );
}
