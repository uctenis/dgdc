/**
 * Google Drive Integration Service
 * Maneja la carga de archivos de proyectos a Google Drive
 */

interface DriveFolder {
  id: string;
  name: string;
  webViewLink: string;
}

interface DriveFile {
  id: string;
  name: string;
  webViewLink: string;
  mimeType: string;
  createdTime: string;
}

const GOOGLE_DRIVE_CLIENT_ID = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID as string | undefined;
const PARENT_FOLDER_NAME = 'DGDC_PROYECTOS_2026'; // Carpeta raíz en Drive

let accessToken: string | null = null;
let gisLoadPromise: Promise<void> | null = null;

const loadGoogleIdentityServices = (): Promise<void> => {
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services.'));
    document.head.appendChild(script);
  });
  return gisLoadPromise;
};

/**
 * Obtiene el token de acceso de Google usando la autenticación de Firebase
 */
export const getDriveAccessToken = async (): Promise<string> => {
  if (accessToken) return accessToken;

  try {
    // Intenta obtener el token de la sesión de Google Sign-In
    const auth = (window as any).gapi?.auth2?.getAuthInstance();
    if (auth?.isSignedIn?.get()) {
      const user = auth.currentUser.get();
      const token = user.getAuthResponse(true).access_token as string | undefined;
      if (token) {
        accessToken = token;
        return token;
      }
    }
  } catch {
    console.warn('No se pudo obtener token de Google Auth, usando modo anónimo');
  }

  if (!GOOGLE_DRIVE_CLIENT_ID) {
    throw new Error('Configure VITE_GOOGLE_DRIVE_CLIENT_ID para almacenar archivos en Google Drive.');
  }

  await loadGoogleIdentityServices();
  return new Promise<string>((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => reject(new Error('La autorización de Google Drive excedió el tiempo de espera.')),
      12000
    );
    const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_DRIVE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (response: { access_token?: string; error?: string }) => {
        if (response.access_token) {
          window.clearTimeout(timeoutId);
          accessToken = response.access_token;
          resolve(response.access_token);
        } else {
          window.clearTimeout(timeoutId);
          reject(new Error(response.error || 'Google Drive no autorizó la carga.'));
        }
      },
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
};

/**
 * Obtiene o crea la carpeta raíz DGDC_PROYECTOS_2026
 */
export const getOrCreateRootFolder = async (): Promise<DriveFolder> => {
  try {
    const token = await getDriveAccessToken();
    
    // Buscar carpeta existente
    const searchQuery = `name='${PARENT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&spaces=drive&fields=files(id,name,webViewLink)&pageSize=1`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (!response.ok) throw new Error(`Error searching Drive: ${response.statusText}`);
    
    const data = await response.json();

    if (data.files && data.files.length > 0) {
      return data.files[0];
    }

    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: PARENT_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    if (!createResponse.ok) throw new Error(`No se pudo crear la carpeta Drive: ${createResponse.statusText}`);
    return createResponse.json();
  } catch (error) {
    console.error('Error getting root folder:', error);
    throw error;
  }
};

/**
 * Obtiene o crea una carpeta para un proyecto específico
 */
export const getOrCreateProjectFolder = async (
  projectId: string,
  projectName: string
): Promise<DriveFolder> => {
  try {
    const token = await getDriveAccessToken();
    const rootFolder = await getOrCreateRootFolder();
    
    const folderName = `${projectName}_${projectId}`;
    const searchQuery = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${rootFolder.id}' in parents and trashed=false`;
    
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&spaces=drive&fields=files(id,name,webViewLink)&pageSize=1`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (!response.ok) throw new Error(`Error searching project folder: ${response.statusText}`);
    
    const data = await response.json();

    if (data.files && data.files.length > 0) {
      return data.files[0];
    }

    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [rootFolder.id] }),
    });
    if (!createResponse.ok) throw new Error(`No se pudo crear la carpeta de la licitación: ${createResponse.statusText}`);
    return createResponse.json();
  } catch (error) {
    console.error('Error getting project folder:', error);
    throw error;
  }
};

/**
 * Sube un archivo a la carpeta del proyecto en Google Drive
 */
export const uploadFileToProjectFolder = async (
  file: File,
  projectId: string,
  projectName: string
): Promise<{ id: string; name: string; url: string; mimeType: string; storage: 'drive' | 'local' }> => {
  try {
    const token = await getDriveAccessToken();
    
    // Nota: Usar API key tiene limitaciones, se recomienda usar OAuth 2.0 completo
    // Para el MVP, usamos Drive API con el token disponible
    
    const projectFolder = await getOrCreateProjectFolder(projectId, projectName);
    
    // Crear metadata del archivo
    const metadata = {
      name: file.name,
      parents: [projectFolder.id],
      mimeType: file.type
    };

    // Preparar formulario multipart para upload
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    // Subir archivo a Drive
    const uploadResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,mimeType',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
      }
    );

    if (!uploadResponse.ok) {
      // Fallback: Si no se puede subir a Drive, crear un registro local con información
      console.warn(`No se pudo subir a Drive: ${uploadResponse.statusText}. Usando almacenamiento local.`);
      
      return {
        id: `local_${Date.now()}`,
        name: file.name,
        url: URL.createObjectURL(file),
        mimeType: file.type,
        storage: 'local',
      };
    }

    const uploadedFile = await uploadResponse.json();

    return {
      id: uploadedFile.id,
      name: uploadedFile.name,
      url: uploadedFile.webViewLink || `https://drive.google.com/file/d/${uploadedFile.id}/view`,
      mimeType: uploadedFile.mimeType,
      storage: 'drive',
    };
  } catch (error) {
    console.error('Error uploading file to Drive:', error);
    
    // Fallback: guardar archivo localmente
    return {
      id: `local_${Date.now()}`,
      name: file.name,
      url: URL.createObjectURL(file),
      mimeType: file.type,
      storage: 'local',
    };
  }
};

/**
 * Lista todos los archivos en la carpeta del proyecto
 */
export const listProjectFiles = async (
  projectId: string,
  projectName: string
): Promise<DriveFile[]> => {
  try {
    const token = await getDriveAccessToken();
    const projectFolder = await getOrCreateProjectFolder(projectId, projectName);

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${projectFolder.id}' in parents and trashed=false&spaces=drive&fields=files(id,name,webViewLink,mimeType,createdTime)&pageSize=100`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (!response.ok) throw new Error(`Error listing files: ${response.statusText}`);
    
    const data = await response.json();
    return data.files || [];
  } catch (error) {
    console.error('Error listing project files:', error);
    return [];
  }
};

/**
 * Descarga un archivo desde Google Drive
 */
export const getDownloadURL = async (fileId: string): Promise<string> => {
  // Google Drive no permite descargas directas con API key
  // Retorna el URL de visualización en Drive
  return `https://drive.google.com/file/d/${fileId}/view`;
};

/**
 * Elimina un archivo de Google Drive
 */
export const deleteFileFromDrive = async (fileId: string): Promise<boolean> => {
  try {
    if (fileId.startsWith('local_')) {
      // Es un archivo local, no hacer nada
      return true;
    }

    const token = await getDriveAccessToken();

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (!response.ok) {
      console.warn(`No se pudo eliminar archivo de Drive: ${response.statusText}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error deleting file from Drive:', error);
    return false;
  }
};

export const driveService = {
  getDriveAccessToken,
  getOrCreateRootFolder,
  getOrCreateProjectFolder,
  uploadFileToProjectFolder,
  listProjectFiles,
  getDownloadURL,
  deleteFileFromDrive
};
