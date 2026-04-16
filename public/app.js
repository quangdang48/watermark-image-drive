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
const viewerNameInput = document.getElementById('viewerNameInput');
const applyViewerNameButton = document.getElementById('applyViewerNameButton');
const refreshLibraryButton = document.getElementById('refreshLibraryButton');
const expandAllFoldersButton = document.getElementById('expandAllFoldersButton');
const collapseAllFoldersButton = document.getElementById('collapseAllFoldersButton');
const createFolderButton = document.getElementById('createFolderButton');
const openUploadModalButton = document.getElementById('openUploadModalButton');
const createFolderInput = document.getElementById('createFolderInput');
const createFolderConfirmButton = document.getElementById('createFolderConfirmButton');
const saveEditModalButton = document.getElementById('saveEditModalButton');
const openImageByIdButton = document.getElementById('openImageByIdButton');
const folderModal = document.getElementById('folderModal');
const editModal = document.getElementById('editModal');
const uploadModal = document.getElementById('uploadModal');
const confirmModal = document.getElementById('confirmModal');
const confirmModalTitle = document.getElementById('confirmModalTitle');
const confirmModalMessage = document.getElementById('confirmModalMessage');
const confirmModalAcceptButton = document.getElementById('confirmModalAcceptButton');
const confirmModalCancelButton = document.getElementById('confirmModalCancelButton');
const uploadButton = document.getElementById('uploadButton');
const totalFoldersMetric = document.getElementById('totalFoldersMetric');
const totalImagesMetric = document.getElementById('totalImagesMetric');
const currentFolderMetric = document.getElementById('currentFolderMetric');
const downloadCurrentImageButton = document.getElementById('downloadCurrentImageButton');
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
let expandedFolderIds = new Set();
let selectedImages = new Set();
let currentImageId = null;
let currentFolderId = null;
let viewerHasImage = false;
let confirmResolver = null;
let activeViewerName = '';

function readCookieValue(name) {
  const cookie = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));

  if (!cookie) {
    return '';
  }

  return decodeURIComponent(cookie.slice(name.length + 1));
}

function syncViewerNameCookie() {
  if (currentView === 'student' && activeViewerName) {
    document.cookie = `viewerName=${encodeURIComponent(activeViewerName)}; Max-Age=604800; Path=/; SameSite=Lax`;
    return;
  }

  document.cookie = 'viewerName=; Max-Age=0; Path=/; SameSite=Lax';
}

function decorateAssetUrl(assetPath) {
  if (currentView !== 'student' || !activeViewerName) {
    return assetPath;
  }

  const url = new URL(assetPath, window.location.origin);
  url.searchParams.set('viewerName', activeViewerName);
  return `${url.pathname}${url.search}`;
}

function applyViewerName({ reload = false, silent = false } = {}) {
  activeViewerName = String(viewerNameInput?.value || activeViewerName || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 48);

  if (viewerNameInput) {
    viewerNameInput.value = activeViewerName;
  }

  syncViewerNameCookie();

  if (!silent) {
    if (activeViewerName) {
      showToast('Watermark updated', `Preview watermark: ${activeViewerName}`, 'info');
      setStatus('Student watermark name saved.', activeViewerName);
    } else {
      showToast('Watermark cleared', 'The preview is now using the default tiles.', 'info');
      setStatus('Student watermark cleared.');
    }
  }

  if (reload && currentImageId) {
    loadImageById(currentImageId);
  }
}

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

function openModal(modalElement) {
  if (!modalElement) {
    return;
  }

  modalElement.hidden = false;
  document.body.classList.add('modal-open');
}

function closeModal(modalElement) {
  if (!modalElement) {
    return;
  }

  modalElement.hidden = true;

  if (modalElement === confirmModal && confirmResolver) {
    const resolve = confirmResolver;
    confirmResolver = null;
    resolve(false);
  }

  const allModalsClosed = [folderModal, editModal, uploadModal, confirmModal]
    .filter(Boolean)
    .every((modal) => modal.hidden);

  if (allModalsClosed) {
    document.body.classList.remove('modal-open');
  }
}

function settleConfirmation(result) {
  if (confirmResolver) {
    const resolve = confirmResolver;
    confirmResolver = null;
    resolve(result);
  }

  if (confirmModal) {
    confirmModal.hidden = true;
  }

  const allModalsClosed = [folderModal, editModal, uploadModal, confirmModal]
    .filter(Boolean)
    .every((modal) => modal.hidden);

  if (allModalsClosed) {
    document.body.classList.remove('modal-open');
  }
}

function requestConfirmation({ title, message, confirmLabel = 'Confirm' }) {
  if (!confirmModal || !confirmModalTitle || !confirmModalMessage || !confirmModalAcceptButton) {
    return Promise.resolve(false);
  }

  if (confirmResolver) {
    settleConfirmation(false);
  }

  confirmModalTitle.textContent = title;
  confirmModalMessage.textContent = message;
  confirmModalAcceptButton.textContent = confirmLabel;
  openModal(confirmModal);

  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function applyViewMode() {
  document.body.dataset.view = currentView;
  teacherViewBtn.classList.toggle('is-active', currentView === 'teacher');
  studentViewBtn.classList.toggle('is-active', currentView === 'student');

  if (currentView === 'student') {
    activeViewerName = readCookieValue('viewerName');
    if (viewerNameInput) {
      viewerNameInput.value = activeViewerName;
    }
    pageTitle.textContent = 'Student Drive';
    pageIntro.textContent = 'Students can browse folders, view images, and preview a personalized watermark.';
    setStatus(
      'Student view ready. Select a folder and image from the library.',
      activeViewerName ? `Watermark name: ${activeViewerName}` : 'Enter your name to stamp the preview.',
    );
    return;
  }

  activeViewerName = '';
  syncViewerNameCookie();
  pageTitle.textContent = 'Teacher Drive';
  pageIntro.textContent = 'Teachers can upload, download, and remove images.';
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
  viewerElement.innerHTML = `
    <div class="viewer-empty-state">
      <div class="viewer-empty-icon">🖼️</div>
      <div>
        <h3>Select an image to preview</h3>
        <p>${message}</p>
      </div>
    </div>`;
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
      tile.src = decorateAssetUrl(`/tiles/${payload.imageId}/${highestLevel}/${column}_${row}.jpg`);
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
  viewerElement.innerHTML = '';

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
    tileSources: decorateAssetUrl(payload.dziUrl),
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
  if (!selectedCount) {
    return;
  }

  selectedCount.textContent = `${selectedImages.size} selected`;
}

function updateManagementState() {
  const hasFolder = Boolean(getCurrentFolder());
  const hasImage = Boolean(getCurrentImage());

  if (saveImageButton) {
    saveImageButton.disabled = !hasImage;
  }

  if (deleteImageButton) {
    deleteImageButton.disabled = !hasImage;
  }

  if (renameFolderButton) {
    renameFolderButton.disabled = !hasFolder;
  }

  if (deleteFolderButton) {
    deleteFolderButton.disabled = !hasFolder;
  }

  if (downloadCurrentImageButton) {
    downloadCurrentImageButton.disabled = !hasImage;
  }

  if (manageFolderInput) {
    manageFolderInput.disabled = !hasFolder;
  }

  if (manageImageNameInput) {
    manageImageNameInput.disabled = !hasImage;
  }

  if (loadImageButton) {
    loadImageButton.disabled = !hasImage;
  }

  if (expandAllFoldersButton) {
    expandAllFoldersButton.disabled = libraryFolders.length === 0;
  }

  if (collapseAllFoldersButton) {
    collapseAllFoldersButton.disabled = libraryFolders.length === 0 || expandedFolderIds.size === 0;
  }
}

function renderLibrarySummary() {
  const totalFolders = libraryFolders.length;
  const totalImages = libraryFolders.reduce((sum, folder) => sum + folder.images.length, 0);
  const currentFolder = getCurrentFolder();

  if (totalFoldersMetric) {
    totalFoldersMetric.textContent = String(totalFolders);
  }

  if (totalImagesMetric) {
    totalImagesMetric.textContent = String(totalImages);
  }

  if (currentFolderMetric) {
    currentFolderMetric.textContent = currentFolder?.folderId || '—';
  }

  if (!totalFolders) {
    librarySummary.textContent = 'No folders available yet. Create a folder or upload an image to get started.';
    return;
  }

  const currentFolderCount = currentFolder ? currentFolder.images.length : 0;
  librarySummary.textContent = `${totalFolders} folder(s) • ${totalImages} image(s) • ${currentFolder?.folderId || 'No folder selected'} has ${currentFolderCount} item(s)`;
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
    details.open = expandedFolderIds.has(folder.folderId);

    if (folder.folderId === currentFolderId) {
      details.classList.add('is-selected');
    }

    const summary = document.createElement('summary');
    summary.className = 'tree-folder-summary';
    summary.innerHTML = `
      <span class="tree-folder-main">
        <span class="tree-folder-name">📁 ${folder.folderId}</span>
        <span class="tree-count">${folder.images.length}</span>
      </span>
      <span class="tree-item-actions teacher-only">
        <button type="button" class="tree-action-button" data-action="upload-folder" title="Upload image" aria-label="Upload image">📤</button>
        <button type="button" class="tree-action-button danger" data-action="delete-folder" title="Delete folder" aria-label="Delete folder">🗑️</button>
      </span>`;
    details.addEventListener('toggle', () => {
      if (details.open) {
        expandedFolderIds.add(folder.folderId);
      } else {
        expandedFolderIds.delete(folder.folderId);
      }
      updateManagementState();
    });

    summary.addEventListener('click', () => {
      currentFolderId = folder.folderId;
      window.setTimeout(() => {
        syncManagementInputs();
      }, 0);
    });

    const uploadFolderAction = summary.querySelector('[data-action="upload-folder"]');
    const deleteFolderAction = summary.querySelector('[data-action="delete-folder"]');

    uploadFolderAction?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      currentFolderId = folder.folderId;
      folderInput.value = folder.folderId;
      imageNameInput.value = '';
      imageInput.value = '';
      openModal(uploadModal);
    });

    deleteFolderAction?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      currentFolderId = folder.folderId;
      deleteSelectedFolder();
    });

    details.appendChild(summary);

    const imageList = document.createElement('div');
    imageList.className = 'tree-image-list';

    if (!folder.images.length) {
      const emptyFolderState = document.createElement('div');
      emptyFolderState.className = 'tree-empty';
      emptyFolderState.textContent = 'No images in this folder yet.';
      imageList.appendChild(emptyFolderState);
    }

    folder.images.forEach((image) => {
      const item = document.createElement('div');
      item.className = 'tree-image-item';
      if (image.imageId === currentImageId) {
        item.classList.add('is-selected');
      }

      const imageButton = document.createElement('button');
      imageButton.type = 'button';
      imageButton.className = 'tree-image-button';
      imageButton.textContent = `🖼 ${image.imageName || image.originalFileName || image.imageId}`;

      if (image.imageId === currentImageId) {
        imageButton.classList.add('is-selected');
      }

      const actionBar = document.createElement('div');
      actionBar.className = 'tree-item-actions teacher-only';
      actionBar.innerHTML = `
        <button type="button" class="tree-action-button" data-action="download-image" title="Download image" aria-label="Download image">⬇️</button>
        <button type="button" class="tree-action-button danger" data-action="delete-image" title="Delete image" aria-label="Delete image">🗑️</button>`;

      item.appendChild(imageButton);
      item.appendChild(actionBar);

      imageButton.addEventListener('click', () => {
        currentFolderId = folder.folderId;
        currentImageId = image.imageId;
        expandedFolderIds.add(folder.folderId);
        selectedImages = new Set([image.imageId]);
        updateSelectionCount();
        syncManagementInputs();
        loadImageById(image.imageId);
      });

      actionBar.querySelector('[data-action="download-image"]')?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        currentFolderId = folder.folderId;
        currentImageId = image.imageId;
        selectedImages = new Set([image.imageId]);
        updateSelectionCount();
        syncManagementInputs();
        downloadSelectedImage(image.imageId);
      });

      actionBar.querySelector('[data-action="delete-image"]')?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        currentFolderId = folder.folderId;
        currentImageId = image.imageId;
        deleteSelectedImage();
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

  if (currentFolder?.folderId) {
    folderInput.value = currentFolder.folderId;
  }

  if (manageFolderInput) {
    manageFolderInput.value = currentFolder?.folderId || '';
  }

  if (manageImageNameInput) {
    manageImageNameInput.value = currentImage?.imageName || currentImage?.originalFileName || '';
  }

  if (imageIdInput) {
    imageIdInput.value = currentImage?.imageId || '';
  }

  updateSelectionCount();
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

    const preferredFolderRecord = libraryFolders.find((folder) => folder.folderId === preferredFolder);
    const activeFolder = preferredFolderRecord || libraryFolders[0] || null;

    expandedFolderIds = new Set(
      libraryFolders
        .filter((folder) => expandedFolderIds.has(folder.folderId))
        .map((folder) => folder.folderId),
    );

    if (activeFolder?.folderId && (expandedFolderIds.size === 0 || preferredFolderRecord)) {
      expandedFolderIds.add(activeFolder.folderId);
    }

    currentFolderId = activeFolder?.folderId || null;
    currentImageId = preferredImageId || activeFolder?.images[0]?.imageId || null;
    selectedImages = currentImageId ? new Set([currentImageId]) : new Set();
    syncManagementInputs();
  } catch (error) {
    setStatus('Unable to load folders.', error.message);
  }
}

async function createFolder() {
  const folderName = String(createFolderInput?.value || '').trim();

  if (!folderName) {
    showToast('Warning', 'Enter a folder name first.', 'warning');
    return;
  }

  setStatus('Creating folder...');

  try {
    const response = await fetch('/upload/folders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ folderName }),
    });

    const payload = await response.json();

    if (!response.ok) {
      showToast('Error', payload.error || 'Unable to create folder', 'error');
      setStatus('Unable to create folder.', payload);
      return;
    }

    currentFolderId = payload.folderId;
    currentImageId = null;
    folderInput.value = payload.folderId;
    if (manageFolderInput) {
      manageFolderInput.value = payload.folderId;
    }
    createFolderInput.value = '';
    closeModal(folderModal);
    await refreshLibrary(payload.folderId, null);
    showToast('Success', `Folder created: ${payload.folderId}`, 'success');
    setStatus('Folder created successfully.', payload);
  } catch (error) {
    showToast('Error', 'Unexpected error while creating folder', 'error');
    setStatus('Unexpected error while creating folder.', error.message);
  }
}

async function loadImageById(imageIdOverride) {
  if (currentView === 'student') {
    applyViewerName({ silent: true });
  }

  const imageId = String(imageIdOverride || currentImageId || imageIdInput?.value || '').trim();

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

    if (imageIdInput) {
      imageIdInput.value = payload.imageId;
    }
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

function downloadSelectedImage(imageIdOverride) {
  const imageId = String(imageIdOverride || currentImageId || '').trim();

  if (!imageId) {
    showToast('Warning', 'Select an image first.', 'warning');
    return;
  }

  setStatus('Starting image download...');
  window.location.href = `/upload/${encodeURIComponent(imageId)}/download`;
}

function waitForDelay(durationMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

async function waitForUploadJob(jobId, preferredFolder) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetch(`/upload/jobs/${encodeURIComponent(jobId)}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Unable to read upload job status');
    }

    if (payload.status === 'ok' && payload.image) {
      return payload.image;
    }

    if (payload.status === 'failed') {
      throw new Error(payload.failureReason || 'Upload job failed');
    }

    setStatus(
      'Upload is being processed by the Redis worker...',
      `Job ${jobId} • state: ${payload.state || 'queued'} • folder: ${preferredFolder}`,
    );
    await waitForDelay(1000);
  }

  return null;
}

async function uploadImage() {
  const imageFile = imageInput.files[0];
  const targetFolder = folderInput.value.trim();

  if (!targetFolder) {
    showToast('Warning', 'Select or enter a folder name first.', 'warning');
    return;
  }

  if (!imageFile) {
    showToast('Warning', 'Choose an image file first.', 'warning');
    return;
  }

  const formData = new FormData();
  formData.append('image', imageFile);
  formData.append('folder', targetFolder);
  formData.append('imageName', imageNameInput.value.trim());

  setStatus('Uploading and processing image...');

  try {
    const response = await fetch('/upload', {
      method: 'POST',
      body: formData,
    });

    let payload = await response.json();

    if (!response.ok) {
      showToast('Error', 'Upload failed', 'error');
      setStatus('Upload failed.', payload);
      return;
    }

    imageInput.value = '';
    closeModal(uploadModal);

    if (response.status === 202 || payload.status === 'queued') {
      showToast('Queued', 'Upload accepted. The Redis worker is processing it now.', 'info');
      setStatus('Upload queued successfully.', payload);
      const completedPayload = await waitForUploadJob(payload.jobId, targetFolder);

      if (!completedPayload) {
        await refreshLibrary(targetFolder, currentImageId);
        showToast('Still processing', 'The image is still being processed. Refresh the library in a moment.', 'info');
        return;
      }

      payload = completedPayload;
    }

    folderInput.value = payload.folder || '';
    imageNameInput.value = payload.imageName || '';
    if (imageIdInput) {
      imageIdInput.value = payload.imageId;
    }
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

  const confirmed = await requestConfirmation({
    title: 'Delete image',
    message: `Delete image "${currentImage.imageName || currentImage.imageId}"?`,
    confirmLabel: 'Delete image',
  });

  if (!confirmed) {
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
    if (imageIdInput) {
      imageIdInput.value = '';
    }
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

  const confirmed = await requestConfirmation({
    title: 'Delete folder',
    message: `Delete folder "${currentFolder.folderId}" and all images inside it?`,
    confirmLabel: 'Delete folder',
  });

  if (!confirmed) {
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
    if (imageIdInput) {
      imageIdInput.value = '';
    }
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

function expandAllFolders() {
  expandedFolderIds = new Set(libraryFolders.map((folder) => folder.folderId));
  syncManagementInputs();
}

function collapseAllFolders() {
  expandedFolderIds = new Set();
  syncManagementInputs();
}

refreshLibraryButton.addEventListener('click', () => refreshLibrary());

if (createFolderButton) {
  createFolderButton.addEventListener('click', () => {
    createFolderInput.value = '';
    openModal(folderModal);
    createFolderInput.focus();
  });
}

if (openUploadModalButton) {
  openUploadModalButton.addEventListener('click', () => {
    folderInput.value = getCurrentFolder()?.folderId || '';
    imageNameInput.value = '';
    imageInput.value = '';
    openModal(uploadModal);
  });
}

if (createFolderConfirmButton) {
  createFolderConfirmButton.addEventListener('click', createFolder);
}

if (downloadCurrentImageButton) {
  downloadCurrentImageButton.addEventListener('click', () => downloadSelectedImage());
}

if (expandAllFoldersButton) {
  expandAllFoldersButton.addEventListener('click', expandAllFolders);
}

if (collapseAllFoldersButton) {
  collapseAllFoldersButton.addEventListener('click', collapseAllFolders);
}

if (confirmModalAcceptButton) {
  confirmModalAcceptButton.addEventListener('click', () => settleConfirmation(true));
}

if (confirmModalCancelButton) {
  confirmModalCancelButton.addEventListener('click', () => settleConfirmation(false));
}

if (selectAllButton) {
  selectAllButton.addEventListener('click', () => {
    libraryFolders.forEach((folder) => {
      folder.images.forEach((image) => {
        selectedImages.add(image.imageId);
      });
    });
    updateSelectionCount();
    renderLibraryTree();
  });
}

if (clearSelectionButton) {
  clearSelectionButton.addEventListener('click', () => {
    selectedImages.clear();
    updateSelectionCount();
    renderLibraryTree();
  });
}
teacherViewBtn.addEventListener('click', () => {
  window.location.href = '/teacher';
});
studentViewBtn.addEventListener('click', () => {
  window.location.href = '/student';
});
if (imageIdInput) {
  imageIdInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      loadImageById();
    }
  });
}
if (uploadButton) {
  uploadButton.addEventListener('click', uploadImage);
}

if (applyViewerNameButton) {
  applyViewerNameButton.addEventListener('click', () => applyViewerName({ reload: true }));
}

if (viewerNameInput) {
  viewerNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      applyViewerName({ reload: true });
    }
  });
}

document.querySelectorAll('[data-close-modal]').forEach((button) => {
  button.addEventListener('click', () => {
    const modalId = button.getAttribute('data-close-modal');
    closeModal(document.getElementById(modalId));
  });
});

[folderModal, editModal, uploadModal, confirmModal].forEach((modalElement) => {
  modalElement?.addEventListener('click', (event) => {
    if (event.target === modalElement) {
      closeModal(modalElement);
    }
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeModal(folderModal);
    closeModal(editModal);
    closeModal(uploadModal);
    closeModal(confirmModal);
  }
});

applyViewMode();
resetViewer();
refreshLibrary();
