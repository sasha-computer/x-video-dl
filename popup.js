const DEFAULT_FOLDER = 'TweetVideos';

function sanitize(raw) {
  let val = raw.trim();
  // Strip invalid path characters
  val = val.replace(/[<>:"|?*\\]/g, '');
  // Strip leading/trailing slashes
  val = val.replace(/^\/+|\/+$/g, '');
  return val || DEFAULT_FOLDER;
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('folder');
  const saveBtn = document.getElementById('save');
  const status = document.getElementById('status');

  chrome.storage.sync.get({ downloadFolder: DEFAULT_FOLDER }, (result) => {
    input.value = result.downloadFolder;
  });

  saveBtn.addEventListener('click', () => {
    const folder = sanitize(input.value);
    input.value = folder;
    chrome.storage.sync.set({ downloadFolder: folder }, () => {
      status.textContent = 'Saved!';
      setTimeout(() => { status.textContent = ''; }, 2000);
    });
  });
});
