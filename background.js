let id = null
const connections = {}

chrome.runtime.onConnect.addListener(devToolsConnection => {
  // Assign the listener function to a variable so we can remove it later
  const devToolsListener = (message, sender, sendResponse) => {
    if (message.name === 'init') {
      id = message.tabId
      connections[id] = devToolsConnection
      // Send a message back to DevTools
      connections[id].postMessage('Connected!')
    }
  }

  // Listen to messages sent from the DevTools page
  devToolsConnection.onMessage.addListener(devToolsListener)

  devToolsConnection.onDisconnect.addListener(() => {
    devToolsConnection.onMessage.removeListener(devToolsListener)
  })
})

// chrome.webRequest.onCompleted.addListener(
//     function(details) {
//       if (details.statusCode >= 200) {
//         chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
//           chrome.tabs.sendMessage(tabs[0].id, {
//               origin: 'background::webrequest',
//               details,
//               statusCode: details.statusCode,
//             });
//         });
//       }
//     },
//     {urls: ["<all_urls>"]},
//     ["responseHeaders"]
//   );
