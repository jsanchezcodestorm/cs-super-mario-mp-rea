import type { CampaignSave } from '@smw/core';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('dinosaur-land', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('campaigns');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

export async function readSave(): Promise<CampaignSave | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('campaigns', 'readonly');
    const get = transaction.objectStore('campaigns').get('last');
    transaction.oncomplete = () => {
      db.close();
      resolve(get.result);
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export async function writeSave(save: CampaignSave): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('campaigns', 'readwrite');
    transaction.objectStore('campaigns').put(save, 'last');
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };
  });
}
