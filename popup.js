document.addEventListener('DOMContentLoaded', async function () {
  await readAndLoadCheckboxes()
}, false)

async function readAndLoadCheckboxes () {
  const ids = [
    'global_pause',
    'errors_only',
    'hide_images',
    'hide_options',
    'hide_smetrics'
  ]

  ids.forEach(async (id) => {
    const box = document.getElementById(id)
    await chrome.storage.sync.get(id, function (data) {
      box.checked = data[id]
    })

    box.addEventListener('click', function (event) {
      const checkedValue = event.target.checked
      chrome.storage.sync.set({ [id]: checkedValue })
    }, false)
  })
}
