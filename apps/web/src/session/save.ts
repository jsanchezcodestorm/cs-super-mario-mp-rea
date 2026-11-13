import type { CampaignSave } from '@smw/core';
import type { CampaignRef } from '@smw/protocol';

export interface CampaignSlot extends CampaignRef {
  createdAt: number;
  updatedAt: number;
  save: CampaignSave;
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('dinosaur-land', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('campaigns');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

export async function readCampaigns(): Promise<CampaignSlot[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('campaigns', 'readwrite');
    const store = transaction.objectStore('campaigns');
    const records = store.getAll();
    const legacy = store.get('last');
    let migrated: CampaignSlot | undefined;
    legacy.onsuccess = () => {
      if (!legacy.result) return;
      const now = Date.now();
      migrated = {
        id: crypto.randomUUID(),
        name: 'Campagna precedente',
        createdAt: now,
        updatedAt: now,
        save: legacy.result as CampaignSave,
      };
      store.put(migrated, migrated.id);
      store.delete('last');
    };
    transaction.oncomplete = () => {
      db.close();
      const slots = (records.result as CampaignSlot[]).filter((record) =>
        record && typeof record.id === 'string' && typeof record.name === 'string' && record.save,
      );
      if (migrated) slots.push(migrated);
      resolve(slots.sort((a, b) => b.updatedAt - a.updatedAt));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export async function writeCampaignSave(campaign: CampaignRef, save: CampaignSave): Promise<CampaignSlot> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('campaigns', 'readwrite');
    const store = transaction.objectStore('campaigns');
    const previous = store.get(campaign.id);
    let slot: CampaignSlot;
    previous.onsuccess = () => {
      const now = Date.now();
      slot = {
        ...campaign,
        createdAt: (previous.result as CampaignSlot | undefined)?.createdAt ?? now,
        updatedAt: now,
        save,
      };
      store.put(slot, slot.id);
    };
    transaction.oncomplete = () => {
      db.close();
      resolve(slot);
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };
  });
}
