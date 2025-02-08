import * as CONSTANTS from "./constants";

/**
 * This has access to DevTools DOM context, e.g. Panel
 */
let PanelWindow;
let youClickedOn;
let results;

chrome.devtools.panels.create(
  "DEMO Panel name",
  "icon.png",
  "Panel.html",
  (panel) => {
    // code invoked on panel creation
    panel.onShown.addListener(function (extPanelWindow) {
      PanelWindow = extPanelWindow;
      const clearAll = extPanelWindow.document.querySelector("#clearAll");
      youClickedOn = extPanelWindow.document.querySelector("#youClickedOn");
      results = extPanelWindow.document.querySelector("#results");

      const clearAllHandler = () => {
        // Sample: show a greeting alert in the inspected page
        // chrome.devtools.inspectedWindow.eval('alert("Hello from the DevTools extension");');
        if (!results) console.warn("devtools panel not found");
        else results.innerHTML = "";

        // Sending message to browser tabs
        chrome.tabs.query(
          { active: true, currentWindow: true },
          function (tabs) {
            if (tabs && tabs.length > 0) {
              const tabId = tabs[0].id;
              chrome.tabs.sendMessage(tabId, {
                origin: "devtools::clearAll",
              });
            }
          }
        );
      };

      clearAll.removeEventListener("click", clearAllHandler);
      clearAll.addEventListener("click", clearAllHandler);
    });
  }
);

/**
 * @param {number} status Response status code
 * @returns true when error
 */
function isError({ status }) {
  return status !== 200 && status !== 204 && status !== 304;
}

/**
 * @param {string} name Log prefix
 * @param {object} data Object to capture
 * @returns Escaped string for string/object passed in, used for "eval"
 */
function console_log({ name, data }) {
  return `console.log("DEBUG ${name}: " + unescape("` + escape(data) + '"))';
}

/**
 * Removes sensitive data from payload text
 * @param {string} payload POST body text
 * @returns payload without sensitive data logged/displayed
 */
function sanitize({ payload }) {
  const mask = "*********";
  if (!payload) return payload;
  let result = payload;
  CONSTANTS.SANITIZE_PATTERNS.forEach((p) => {
    const pattern = `\"${p}\":\".+\"`;
    const re = new RegExp(pattern);
    result = result.replace(re, `"${p}":"${mask}"`);
  });
  return result;
}

/**
 * Creates a DIV element with prettified <img> or <pre> element in it
 * @param {string} method
 * @param {string} url
 * @param {string} mimeType
 * @param {string} requestBody
 * @param {string} responseBody
 * @returns <div> results node
 */
function create_body_node({
  method,
  url,
  mimeType,
  requestBody,
  responseBody,
}) {
  // Create DIV node
  const divNode = document.createElement("div");

  if (method && url) {
    const urlNode = document.createElement("pre");
    urlNode.innerText = `${method.padEnd(7, " ")} ${url}`;
    urlNode.className = "url body";
    divNode.appendChild(urlNode);
    // Not returning here, continue onto body nodes
  }
  if (requestBody) {
    // Create DIV node
    const payloadNode = document.createElement("pre");
    const pretty = prettify(requestBody);
    if (pretty) {
      payloadNode.innerText = `${pretty}`;
      payloadNode.className = "request body";
      const headingNode = document.createElement("pre");
      headingNode.innerHTML = "Request";
      divNode.appendChild(headingNode);
      divNode.appendChild(payloadNode);
      // Special json_blob
      const hasJsonBlob = requestBody.indexOf("json_blob") !== -1;
      if (hasJsonBlob) {
        const blob = JSON.parse(requestBody).topicData.json_blob;
        const prettyBlob = prettify(blob);
        const jsonBlobNode = document.createElement("pre");
        jsonBlobNode.innerText = `${prettyBlob}`;
        jsonBlobNode.className = "blob body";
        const headingNode = document.createElement("pre");
        headingNode.innerHTML = "json_blob";
        divNode.appendChild(headingNode);
        divNode.appendChild(jsonBlobNode);
      }
    }
  }
  if (responseBody) {
    const contentNode = document.createElement("pre");
    contentNode.innerHTML = responseBody;
    divNode.appendChild(contentNode);

    // if (mimeType?.indexOf("image") !== -1) {
    //   const wrapperImgNode = create_image_wrapper({
    //     src: url,
    //     divNode: null,
    //   });

    //   // Create IMG node
    //   const payloadNode = document.createElement("div");
    //   payloadNode.appendChild(wrapperImgNode);
    //   divNode.appendChild(payloadNode);
    // } else {
    //   // Create DIV node
    //   const payloadNode = document.createElement("pre");
    //   const pretty = prettify(responseBody);
    //   if (pretty) {
    //     payloadNode.innerText = `${pretty}`;
    //     payloadNode.className = "response body";
    //     const headingNode = document.createElement("pre");
    //     headingNode.innerHTML = "Response";
    //     divNode.appendChild(headingNode);
    //     divNode.appendChild(payloadNode);
    //   }
    // }
  } else {
    // Create DIV node
    const payloadNode = document.createElement("pre");
    payloadNode.innerText = "N/A";
    payloadNode.className = "empty body";
    divNode.appendChild(payloadNode);
  }
  return divNode;
}

/**
 * Helper function that handles JSON pretty parsing with error handling
 * @param {string} text
 * @returns "prettified" JSON text OR original text
 */
function prettify(text) {
  let result = text;
  try {
    const obj = JSON.parse(text);
    const pretty = JSON.stringify(obj, null, 2);
    result = pretty;
  } catch (e) {
    console.warn(`Error: Invalid JSON: ${text}`);
  }
  return result;
}

/**
 * @param {object} request request.request
 * @param {object} response request.response
 * @param {string} innerHTML string to write out in node
 * @param {string} payload string from request body
 * @param {string} method GET/POST/OPTIONS
 * @returns <div> results node
 */
function create_result_node({ request, response, innerHTML, payload, method }) {
  const isHtml = request.headers.some(
    (h) => h.name === "accept" && h.value.indexOf("text/html") !== -1
  );

  // Create DIV node
  const divNode = document.createElement("pre");
  divNode.innerText = innerHTML;

  let className = "";
  if (isError({ status: response.status })) className = "error";
  else if (isHtml) className = "page";

  divNode.className = `result ${method.toLowerCase()}`;
  className && divNode.classList.add(className);

  if (payload) {
    // Create DIV node
    const payloadNode = document.createElement("pre");
    const pretty = prettify(payload);
    if (pretty) {
      payloadNode.innerText = `${pretty}`;
      payloadNode.className = "payload body";
      const headingNode = document.createElement("pre");
      headingNode.innerHTML = "Request";
      divNode.appendChild(headingNode);
      divNode.appendChild(payloadNode);
    }
  }
  return divNode;
}

/**
 * Creates a simple <img> node with src
 * @param {string} src Image source
 * @returns <img>
 */
function create_image_node({ src }) {
  const imgNode = document.createElement("img");
  imgNode.setAttribute("src", src);
  return imgNode;
}

/**
 * Creates a DIV element with IMG and supplement in it
 * @param {string} src Image source
 * @param {object} divNode with details for <img>, optional<div>
 * @returns <div class="image-wrapper">
 *            <imgNode />
 *            <divNode />
 *          </div>
 */
function create_image_wrapper({ src, divNode }) {
  const wrapperDivNode = document.createElement("div");
  wrapperDivNode.className = "image-wrapper";

  const imgNode = create_image_node({ src });
  wrapperDivNode.appendChild(imgNode);
  divNode && wrapperDivNode.appendChild(divNode);
  return wrapperDivNode;
}

chrome.devtools.network.onRequestFinished.addListener((request) => {
  request.getContent((responseBody) => {
    // Exclusion list (only www and wwwstg allowed)
    if (
      request.request.url.indexOf("https://www.redbox.com") !== 0 &&
      request.request.url.indexOf("https://wwwstg.redbox.com") !== 0 &&
      request.request.url.indexOf("https://preprod.redbox.com") !== 0 &&
      request.request.url.indexOf("https://smetrics.redbox.com") !== 0
    ) {
      return;
    }
    if (request.response.status === 304) {
      return;
    }
    // if (request.request.headers.some((h) => h.name === 'accept' && h.value.indexOf('image') !== -1)) { return }
    if (
      request.request.headers.some(
        (h) => h.name === "accept" && h.value.indexOf("css") !== -1
      )
    ) {
      return;
    }
    if (request.request.url.indexOf(".js") !== -1) {
      return;
    }
    if (request.request.url.indexOf("font") !== -1) {
      return;
    }

    const url = request.request.url;
    // const rawRequest = JSON.stringify(request.request)
    // const rawResponse = JSON.stringify(request.response)
    // request
    const method = request.request.method.padEnd(7, " ");
    const requestBody = request.request.postData?.text;
    const sanitizedRequestBody = sanitize({ payload: requestBody });

    // const requestText = `${method} ${url}`
    // response
    const status = request.response.status;
    const size = request.response.content?.size;
    // const responseText = `status: ${status}, size: ${size}`
    // 1-liner
    const summaryText = `${method} ${status} ${url}, size: ${size}`;

    // DEBUG statements
    // chrome.devtools.inspectedWindow.eval(
    //     console_log({ name: 'rawRequest', data: rawRequest })
    // );
    // chrome.devtools.inspectedWindow.eval(
    //     console_log({ name: 'rawResponse', data: rawResponse })
    // );
    // chrome.devtools.inspectedWindow.eval(
    //     console_log({ name: 'requestText', data: requestText })
    // );
    // chrome.devtools.inspectedWindow.eval(
    //     console_log({ name: 'responseText', data: responseText })
    // );
    // chrome.devtools.inspectedWindow.eval(
    //     console_log({ name: 'summaryText', data: summaryText })
    // );

    // Create result DIV node
    const divNode = create_result_node({
      request: request.request,
      response: request.response,
      innerHTML: summaryText,
      payload: sanitizedRequestBody,
      method,
    });

    // Append node to Panel
    if (!results) console.warn("devtools panel not found");
    else results.appendChild(divNode);

    // Sending message to browser tabs
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs && tabs.length > 0) {
        const tabId = tabs[0].id;
        chrome.tabs.sendMessage(tabId, {
          origin: "devtools::network",
          request: request.request,
          response: request.response,
          requestBody: sanitizedRequestBody,
          responseBody,
        });
      }
    });
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Receive from content_script "click" listener
  const {
    attributes,
    click,
    imgSrc,
    method,
    mimeType,
    requestBody,
    responseBody,
    url,
    xPosition,
    yPosition,
  } = request;

  // Bail if "results" is not set
  if (!results) {
    console.warn("devtools panel not found");
    return;
  }

  // Messages from content scripts should have sender.tab set
  if (sender.tab && click === true) {
    if (youClickedOn) {
      youClickedOn.innerHTML = `Clicked on (${xPosition}, ${yPosition}) on inspected page.`;
      // CLEAR
      results.innerHTML = "";
    }
    if (method || url || requestBody || responseBody) {
      const node = create_body_node({
        method,
        mimeType,
        requestBody,
        responseBody,
        url,
      });
      results.appendChild(node);
    }
    if (imgSrc) {
      const wrapperImgAttrDivNode = document.createElement("div");
      wrapperImgAttrDivNode.className = "image-wrapper-attr";

      attributes.forEach((attr) => {
        const attrDivNode = document.createElement("div");
        attrDivNode.innerText = attr;
        wrapperImgAttrDivNode.appendChild(attrDivNode);
      });

      const wrapperImgNode = create_image_wrapper({
        src: imgSrc,
        divNode: wrapperImgAttrDivNode,
      });
      results.appendChild(wrapperImgNode);
    }
    sendResponse({
      attributes,
      imgSrc,
      xPosition,
      yPosition,
    });
  }
});

// Create a connection to the background service worker
const backgroundPageConnection = chrome.runtime.connect({
  name: "devtools-page",
});

// Relay the tab ID to the background service worker
backgroundPageConnection.postMessage({
  name: "init",
  tabId: chrome.devtools.inspectedWindow.tabId,
});
