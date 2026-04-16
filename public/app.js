const currentView = window.location.pathname.startsWith('/student') ? 'student' : 'teacher';
const pageTitle = document.getElementById('pageTitle');
const pageIntro = document.getElementById('pageIntro');
const teacherViewBtn = document.getElementById('teacherViewBtn');
const studentViewBtn = document.getElementById('studentViewBtn');
const folderInput = document.getElementById('folderInput');
const imageNameInput = document.getElementById('imageNameInput');
const imageInput = document.getElementById('imageInput');
const manageFolderInput = document.getElementById('manageFolderInput');
const libraryTree = document.getElementById('libraryTree');
const manageImageNameInput = document.getElementById('manageImageNameInput');
const imageIdInput = document.getElementById('imageIdInput');
const refreshLibraryButton = document.getElementById('refreshLibraryButton');
const uploadButton = document.getElementById('uploadButton');
const saveImageButton = document.getElementById('saveImageButton');
const renameFolderButton = document.getElementById('renameFolderButton');
const deleteImageButton = document.getElementById('deleteImageButton');
const deleteFolderButton = document.getElementById('deleteFolderButton');
const loadImageButton = document.getElementById('loadImageButton');
const selectAllButton = document.getElementById('selectAllButton');
const clearSelectionButton = document.getElementById('clearSelectionButton');
const selectedCount = document.getElementById('selectedCount');
const librarySummary = document.getElementById('librarySummary');
const statusBox = document.getElementById('statusBox');
const viewerMeta = document.getElementById('viewerMeta');
const viewerElement = document.getElementById('viewer');
const toastContainer = document.getElementById('toastContainer');

let viewerInstance = null;
let fallbackTimer = null;
let libraryFolders = [];
let selectedImages = new Set();
let currentImageId = null;
let currentFolderId = null;
let viewerHasImage = false;

function showToast(title, message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<div class="toast-title">${title}</div><div class="toast-message">${message}</div>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toast-fade-out 0.3s ease-out forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function setStatus(message, detail) {
  const lines = [message];
  if (detail) {
    lines.push(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2));
  }

  statusBox.textContent = lines.join('\n\n');
}

function applyViewMode() {
  document.body.dataset.view = currentView;
  teacherViewBtn.classList.toggle('is-active', currentView === 'teacher');
  studentViewBtn.classList.toggle('is-active', currentView === 'student');

  if (currentView === 'student') {
    pageTitle.textContent = 'Student Gallery';
    pageIntro.textContent = 'Students can browse folders and open images in the viewer.';
    setStatus('Student view ready. Select a folder and image from the tree.');
    return;
  }

  pageTitle.textContent = 'Teacher Gallery';
  pageIntro.textContent = 'Teachers can upload images and manage folders.';
}

function resetViewer(message = 'No image loaded yet.') {
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }

  if (viewerInstance) {
    viewerInstance.destroy();
    viewerInstance = null;
  }

  viewerHasImage = false;
  viewerElement.innerHTML = '';
  viewerElement.classList.remove('viewer-fallback');
  viewerMeta.textContent = message;
}

function renderFallbackViewer(payload) {
  resetViewer(viewerMeta.textContent);
  viewerElement.classList.add('viewer-fallback');
  viewerHasImage = true;

  const viewport = document.createElement('div');
  viewport.className = 'viewer-fallback-viewport';

  const stage = document.createElement('div');
  stage.className = 'viewer-fallback-stage';
  stage.style.width = `${payload.metadata.width}px`;
  stage.style.height = `${payload.metadata.height}px`;

  const highestLevel = Array.isArray(payload.levels) && payload.levels.length > 0
    ? Math.max(...payload.levels)
    : 0;
  const tileSize = 256;
  const columns = Math.ceil(payload.metadata.width / tileSize);
  const rows = Math.ceil(payload.metadata.height / tileSize);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const tile = document.createElement('img');
      tile.alt = `Tile ${column},${row}`;
      tile.src = `/tiles/${payload.imageId}/${highestLevel}/${column}_${row}.jpg`;
      tile.style.left = `${column * tileSize}px`;
      tile.style.top = `${row * tileSize}px`;
      tile.style.width = `${Math.min(tileSize, payload.metadata.width - column * tileSize)}px`;
      tile.style.height = `${Math.min(tileSize, payload.metadata.height - row * tileSize)}px`;
      stage.appendChild(tile);
    }
  }

  viewport.appendChild(stage);
  viewerElement.appendChild(viewport);
}

function renderViewer(payload, successMessage = 'Image loaded successfully.') {
  resetViewer();
  viewerHasImage = true;

  const label = [payload.folder, payload.imageName].filter(Boolean).join(' / ');
  viewerMeta.textContent = `${label || payload.imageId} — ${payload.metadata.width} × ${payload.metadata.height}`;

  const enableFallback = () => {
    renderFallbackViewer(payload);
    setStatus(successMessage, payload);
  };

  if (typeof OpenSeadragon !== 'function') {
    enableFallback();
    return;
  }

  let opened = false;

  viewerInstance = OpenSeadragon({
    id: 'viewer',
    prefixUrl: 'https://cdnjs.cloudflare.com/ajax/libs/openseadragon/5.0.1/images/',
    tileSources: payload.dziUrl,
    showNavigator: true,
  });

  viewerInstance.addOnceHandler('open', () => {
    opened = true;
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  });

  viewerInstance.addOnceHandler('open-failed', enableFallback);

  fallbackTimer = window.setTimeout(() => {
    if (!opened) {
      enableFallback();
    }
  }, 2000);
}

function getCurrentFolder() {
  return libraryFolders.find((folder) => folder.folderId === currentFolderId) || null;
}

function getCurrentImage() {
  const currentFolder = getCurrentFolder();
  return currentFolder?.images.find((image) => image.imageId === currentImageId) || null;
}

function updateSelectionCount() {
  selectedCount.textContent = `${selectedImages.size} selected`;
}

function updateManagementState() {
  const hasFolder = Boolean(getCurrentFolder());
  const hasImage = Boolean(getCurrentImage());

  saveImageButton.disabled = !hasImage;
  deleteImageButton.disabled = !hasImage;
  renameFolderButton.disabled = !hasFolder;
  deleteFolderButton.disabled = !hasFolder;
  manageFolderInput.disabled = !hasFolder;
  manageImageNameInput.disabled = !hasImage;
  loadImageButton.disabled = !hasImage;
}

function renderLibrarySummary() {
  const totalFolders = libraryFolders.length;
  const totalImages = libraryFolders.reduce((sum, folder) => sum + folder.images.length, 0);
  const currentFolder = getCurrentFolder();

  if (!totalFolders) {
    librarySummary.textContent = 'No folders available yet. Upload an image to create your first folder.';
    return;
  }

  const currentFolderCount = currentFolder ? currentFolder.images.length : 0;
  librarySummary.textContent = `${totalFolders} folder(s) • ${totalImages} image(s) • ${currentFolder?.folderId || 'No folder'} has ${currentFolderCount} item(s)`;
}

function renderLibraryTree() {
  libraryTree.innerHTML = '';

  if (!libraryFolders.length) {
    const emptyState = document.createElement('div');
    emptyState.className = 'tree-empty';
    emptyState.textContent = 'No folders yet.';
    libraryTree.appendChild(emptyState);
    return;
  }

  libraryFolders.forEach((folder) => {
    const details = document.createElement('details');
    details.className = 'tree-folder';
    details.open = folder.folderId === currentFolderId;

    if (folder.folderId === currentFolderId) {
      details.classList.add('is-selected');
    }

    const summary = document.createElement('summary');
    summary.className = 'tree-folder-summary';
    summary.innerHTML = `<span class="tree-folder-name">📁 ${folder.folderId}</span><span class="tree-count">${folder.images.length}</span>`;
    summary.addEventListener('click', () => {
      currentFolderId = folder.folderId;
      renderLibraryTree();
    });

    details.appendChild(summary);

    const imageList = document.createElement('div');
    imageList.className = 'tree-image-list';

    folder.images.forEach((image) => {
      const item = document.createElement('div');
      item.className = 'tree-image-item';
      if (selectedImages.has(image.imageId)) {
        item.classList.add('is-selected');
      }

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'tree-image-checkbox';
      checkbox.checked = selectedImages.has(image.imageId);
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        if (checkbox.checked) {
          selectedImages.add(image.imageId);
        } else {
          selectedImages.delete(image.imageId);
        }
        updateSelectionCount();
        renderLibraryTree();
      });

      const imageButton = document.createElement('button');
      imageButton.type = 'button';
      imageButton.className = 'tree-image-button';
      imageButton.textContent = `🖼 ${image.imageName || image.originalFileName || image.imageId}`;

      if (image.imageId === currentImageId) {
        imageButton.classList.add('is-selected');
      }

      item.appendChild(checkbox);
      item.appendChild(imageButton);

      imageButton.addEventListener('click', () => {
        currentFolderId = folder.folderId;
        currentImageId = image.imageId;
        selectedImages.add(image.imageId);
        updateSelectionCount();
        syncManagementInputs();
        loadImageById(image.imageId);
      });

      imageList.appendChild(item);
    });

    details.appendChild(imageList);
    libraryTree.appendChild(details);
  });
}

function syncManagementInputs() {
  const currentFolder = getCurrentFolder();
  const currentImage = getCurrentImage();

  manageFolderInput.value = currentFolder?.folderId || '';
  manageImageNameInput.value = currentImage?.imageName || currentImage?.originalFileName || '';
  imageIdInput.value = currentImage?.imageId || '';
  updateManagementState();
  renderLibrarySummary();
  renderLibraryTree();
}

async function refreshLibrary(preferredFolder = currentFolderId, preferredImageId = currentImageId) {
  try {
    const response = await fetch('/upload/library');
    const payload = await response.json();

    if (!response.ok) {
      setStatus('Unable to load folders.', payload);
      return;
    }

    libraryFolders = Array.isArray(payload.folders) ? payload.folders : [];
    currentFolderId = preferredFolder || (libraryFolders[0]?.folderId);
    currentImageId = preferredImageId || (libraryFolders[0]?.images[0]?.imageId);
    syncManagementInputs();
  } catch (error) {
    setStatus('Unable to load folders.', error.message);
  }
}

async function loadImageById(imageIdOverride) {
  const imageId = String(imageIdOverride || imageIdInput.value || '').trim();

  if (!imageId) {
    showToast('Warning', 'No image selected. Click an image in the library tree.', 'warning');
    return;
  }

  setStatus('Loading image from backend...');

  try {
    const response = await fetch(`/upload/${encodeURIComponent(imageId)}`);
    const payload = await response.json();

    if (!response.ok) {
      showToast('Error', 'Image lookup failed', 'error');
      setStatus('Image lookup failed.', payload);
      return;
    }

    imageIdInput.value = payload.imageId;
    folderInput.value = payload.folder || '';
    imageNameInput.value = payload.imageName || '';
    await refreshLibrary(payload.folder, payload.imageId);
    showToast('Success', `Loaded: ${payload.imageName || payload.imageId}`, 'success');
    setStatus('Image loaded successfully.', payload);
    renderViewer(payload, 'Image loaded successfully.');
  } catch (error) {
    showToast('Error', 'Unexpected error while loading image', 'error');
    setStatus('Unexpected error while loading image.', error.message);
  }
}

async function uploadImage() {
  const imageFile = imageInput.files[0];

  if (!imageFile) {
    showToast('Warning', 'Choose an image file first.', 'warning');
    return;
  }

  const formData = new FormData();
  formData.append('image', imageFile);
  formData.append('folder', folderInput.value.trim());
  formData.append('imageName', imageNameInput.value.trim());

  setStatus('Uploading and processing image...');

  try {
    const response = await fetch('/upload', {
      method: 'POST',
      body: formData,
    });

    const payload = await response.json();

    if (!response.ok) {
      showToast('Error', 'Upload failed', 'error');
      setStatus('Upload failed.', payload);
      return;
    }

    folderInput.value = payload.folder || '';
    imageNameInput.value = payload.imageName || '';
    imageIdInput.value = payload.imageId;
    imageInput.value = '';
    await refreshLibrary(payload.folder, payload.imageId);
    showToast('Success', `Uploaded: ${payload.imageName || payload.imageId}`, 'success');
    setStatus('Upload completed successfully.', payload);
    renderViewer(payload, 'Upload completed successfully.');
  } catch (error) {
    showToast('Error', 'Unexpected error while uploading', 'error');
    setStatus('Unexpected error while uploading.', error.message);
  }
}

async function saveImageChanges() {
  const imageId = String(currentImageId || '').trim();

  if (!imageId) {
    showToast('Warning', 'Select an image to update.', 'warning');
    return;
  }

  setStatus('Saving image changes...');

  try {
    const response = await fetch(`/upload/${encodeURIComponent(imageId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        folder: manageFolderInput.value.trim(),
        imageName: manageImageNameInput.value.trim(),
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      showToast('Error', 'Unable to update image', 'error');
      setStatus('Unable to update image.', payload);
      return;
    }

    folderInput.value = payload.folder || '';
    imageNameInput.value = payload.imageName || '';
    imageIdInput.value = payload.imageId;
    await refreshLibrary(payload.folder, payload.imageId);
    showToast('Success', 'Image updated successfully', 'success');
    setStatus('Image updated successfully.', payload);
  } catch (error) {
    showToast('Error', 'Unexpected error while updating image', 'error');
    setStatus('Unexpected error while updating image.', error.message);
  }
}

async function renameSelectedFolder() {
  const currentFolder = getCurrentFolder();
  const nextFolderName = manageFolderInput.value.trim();

  if (!currentFolder) {
    showToast('Warning', 'Select a folder to rename.', 'warning');
    return;
  }

  if (!nextFolderName) {
    showToast('Warning', 'Enter a new folder name first.', 'warning');
    return;
  }

  setStatus('Renaming folder...');

  try {
    const response = await fetch(`/upload/folders/${encodeURIComponent(currentFolder.folderId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nextFolderName }),
    });

    const payload = await response.json();

    if (!response.ok) {
      showToast('Error', 'Unable to rename folder', 'error');
      setStatus('Unable to rename folder.', payload);
      return;
    }

    await refreshLibrary(payload.folderId, currentImageId);
    showToast('Success', `Folder renamed to: ${nextFolderName}`, 'success');
    setStatus('Folder renamed successfully.', payload);
  } catch (error) {
    showToast('Error', 'Unexpected error while renaming folder', 'error');
    setStatus('Unexpected error while renaming folder.', error.message);
  }
}

async function deleteSelectedImage() {
  const currentImage = getCurrentImage();

  if (!currentImage) {
    showToast('Warning', 'Select an image to delete.', 'warning');
    return;
  }

  if (!window.confirm(`Delete image "${currentImage.imageName || currentImage.imageId}"?`)) {
    return;
  }

  setStatus('Deleting image...');

  try {
    const response = await fetch(`/upload/${encodeURIComponent(currentImage.imageId)}`, {
      method: 'DELETE',
    });

    const payload = await response.json();

    if (!response.ok) {
      showToast('Error', 'Unable to delete image', 'error');
      setStatus('Unable to delete image.', payload);
      return;
    }

    resetViewer();
    folderInput.value = '';
    imageNameInput.value = '';
    imageIdInput.value = '';
    selectedImages.delete(currentImage.imageId);
    currentImageId = null;
    await refreshLibrary();
    showToast('Success', 'Image deleted successfully', 'success');
    setStatus('Image deleted successfully.', payload);
  } catch (error) {
    showToast('Error', 'Unexpected error while deleting image', 'error');
    setStatus('Unexpected error while deleting image.', error.message);
  }
}

async function deleteSelectedFolder() {
  const currentFolder = getCurrentFolder();

  if (!currentFolder) {
    showToast('Warning', 'Select a folder to delete.', 'warning');
    return;
  }

  if (!window.confirm(`Delete folder "${currentFolder.folderId}" and all images inside it?`)) {
    return;
  }

  setStatus('Deleting folder...');

  try {
    const response = await fetch(`/upload/folders/${encodeURIComponent(currentFolder.folderId)}`, {
      method: 'DELETE',
    });

    const payload = await response.json();

    if (!response.ok) {
      showToast('Error', 'Unable to delete folder', 'error');
      setStatus('Unable to delete folder.', payload);
      return;
    }

    resetViewer();
    folderInput.value = '';
    imageNameInput.value = '';
    imageIdInput.value = '';
    currentImageId = null;
    currentFolderId = null;
    selectedImages.clear();
    await refreshLibrary();
    showToast('Success', 'Folder deleted successfully', 'success');
    setStatus('Folder deleted successfully.', payload);
  } catch (error) {
    showToast('Error', 'Unexpected error while deleting folder', 'error');
    setStatus('Unexpected error while deleting folder.', error.message);
  }
}

refreshLibraryButton.addEventListener('click', () => refreshLibrary());
loadImageButton.addEventListener('click', () => loadImageById(currentImageId));
saveImageButton.addEventListener('click', saveImageChanges);
renameFolderButton.addEventListener('click', renameSelectedFolder);
deleteImageButton.addEventListener('click', deleteSelectedImage);
deleteFolderButton.addEventListener('click', deleteSelectedFolder);
selectAllButton.addEventListener('click', () => {
  libraryFolders.forEach((folder) => {
    folder.images.forEach((image) => {
      selectedImages.add(image.imageId);
    });
  });
  updateSelectionCount();
  renderLibraryTree();
});
clearSelectionButton.addEventListener('click', () => {
  selectedImages.clear();
  updateSelectionCount();
  renderLibraryTree();
});
teacherViewBtn.addEventListener('click', () => {
  window.location.href = '/teacher';
});
studentViewBtn.addEventListener('click', () => {
  window.location.href = '/student';
});
imageIdInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    loadImageById();
  }
});
uploadButton.addEventListener('click', uploadImage);
applyViewMode();
resetViewer();
refreshLibrary();
