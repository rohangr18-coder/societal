import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { InAppNotification } from '../types';
import { sanitizeForFirestore } from '../utils/firestoreSanitizer';

export function subscribeNotifications(userId: string, callback: (notifications: InAppNotification[]) => void) {
  const path = 'notifications';
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const list: InAppNotification[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as InAppNotification);
        });
        // Guarantee newest-first timestamp sorting
        list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        callback(list);
      },
      (error) => {
        // Fallback without orderBy if composite index is pending
        console.warn('subscribeNotifications fallback query:', error.message);
        try {
          const fallbackQ = query(
            collection(db, 'notifications'),
            where('userId', '==', userId),
            limit(100)
          );
          return onSnapshot(
            fallbackQ,
            (snapshot) => {
              const list: InAppNotification[] = [];
              snapshot.forEach((docSnap) => {
                list.push({ id: docSnap.id, ...docSnap.data() } as InAppNotification);
              });
              list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
              callback(list);
            },
            (fallbackErr) => {
              handleFirestoreError(fallbackErr, OperationType.LIST, path);
            }
          );
        } catch {
          handleFirestoreError(error, OperationType.LIST, path);
        }
      }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function getUserNotifications(userId: string): Promise<InAppNotification[]> {
  const path = 'notifications';
  try {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(100)
      );
      const snaps = await getDocs(q);
      const list: InAppNotification[] = [];
      snaps.forEach((d) => list.push({ id: d.id, ...d.data() } as InAppNotification));
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      return list;
    } catch {
      // Fallback query without orderBy
      const fallbackQ = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        limit(100)
      );
      const snaps = await getDocs(fallbackQ);
      const list: InAppNotification[] = [];
      snaps.forEach((d) => list.push({ id: d.id, ...d.data() } as InAppNotification));
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      return list;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function sendNotification(
  data: Omit<InAppNotification, 'id' | 'createdAt' | 'read'> & { id?: string }
): Promise<void> {
  const path = 'notifications';
  try {
    const notifId = data.id || doc(collection(db, 'notifications')).id;
    const notifRef = doc(db, 'notifications', notifId);
    const notifDoc: InAppNotification = {
      ...data,
      id: notifId,
      recipientUserId: data.recipientUserId || data.userId,
      deliveryStatus: data.deliveryStatus || 'delivered',
      read: false,
      createdAt: new Date().toISOString(),
    };
    await setDoc(notifRef, sanitizeForFirestore(notifDoc), { merge: true });
  } catch (error) {
    console.warn('Notification send failed:', error);
  }
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const path = `notifications/${id}`;
  try {
    await updateDoc(doc(db, 'notifications', id), {
      read: true,
      readAt: new Date().toISOString(),
      deliveryStatus: 'read',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleNotificationRead(id: string, read: boolean): Promise<void> {
  const path = `notifications/${id}`;
  try {
    await updateDoc(doc(db, 'notifications', id), {
      read,
      readAt: read ? new Date().toISOString() : null,
      deliveryStatus: read ? 'read' : 'delivered',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteNotification(id: string): Promise<void> {
  const path = `notifications/${id}`;
  try {
    await deleteDoc(doc(db, 'notifications', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const path = 'notifications';
  try {
    const q = query(collection(db, 'notifications'), where('userId', '==', userId), where('read', '==', false));
    const snaps = await getDocs(q);
    const now = new Date().toISOString();
    const promises = snaps.docs.map((d) =>
      updateDoc(d.ref, {
        read: true,
        readAt: now,
        deliveryStatus: 'read',
      })
    );
    await Promise.all(promises);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function clearAllNotifications(userId: string): Promise<void> {
  const path = 'notifications';
  try {
    const q = query(collection(db, 'notifications'), where('userId', '==', userId));
    const snaps = await getDocs(q);
    const promises = snaps.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(promises);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
