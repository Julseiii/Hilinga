import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { firestore, storage } from "@/lib/firebase";

export type BusinessPostCategory = "Photos & Videos" | "Events" | "Promotions";

export type BusinessPost = {
  id: string;
  ownerUid?: string;
  sourceId?: string;
  businessId: string;
  businessName: string;
  businessCategory: string;
  businessLocation: string;
  businessLogoUrl: string;
  category: BusinessPostCategory;
  title: string;
  detail: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  eventDate?: string;
  eventLocation?: string;
  promotionOffer?: string;
  promotionEnds?: string;
  createdAt: string;
};

export type PublishBusinessPostInput = Omit<BusinessPost, "id" | "businessId"> & {
  ownerUid: string;
  sourceId: string;
};

type StoredBusinessPage = {
  name?: string;
  businessScale?: "Small business" | "Big enterprise";
  category?: string;
  location?: string;
  hours?: string;
  about?: string;
  logoUrl?: string;
};

export type RegisteredSmallBusiness = {
  id: string;
  name: string;
  category: string;
  location: string;
  hours: string;
  about: string;
  latitude: number;
  longitude: number;
};

export type StoredBusinessItem = Omit<BusinessPost, "id" | "ownerUid" | "sourceId" | "businessId" | "businessName" | "businessCategory" | "businessLocation" | "businessLogoUrl" | "category" | "mediaUrl" | "mediaType"> & {
  id: string;
  category?: BusinessPostCategory;
  kind?: string;
  imageUrl?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
};

export const BUSINESS_CONTENT_CHANGED_EVENT = "hilinga:business-content-changed";

const businessPostsCollection = collection(firestore, "businessPosts");

const ALBAY_TOWN_COORDINATES: Array<{ patterns: RegExp[]; lat: number; lng: number }> = [
  { patterns: [/cagsawa/i, /daraga/i, /busay/i, /anislag/i], lat: 13.1417, lng: 123.7150 },
  { patterns: [/boulevard/i, /embarcadero/i, /port/i, /dap-dap/i], lat: 13.1430, lng: 123.7550 },
  { patterns: [/legazpi/i, /peñaranda/i, /rizal/i, /gogon/i, /imperial/i, /maroroy/i, /rawis/i], lat: 13.1391, lng: 123.7438 },
  { patterns: [/camalig/i, /sumlang/i, /quituinan/i, /hoyop/i], lat: 13.1511, lng: 123.6667 },
  { patterns: [/guinobatan/i, /masaraga/i], lat: 13.1903, lng: 123.6010 },
  { patterns: [/ligao/i, /kawa-kawa/i, /kawakawa/i], lat: 13.2411, lng: 123.5358 },
  { patterns: [/mayon skyline/i, /tabaco/i], lat: 13.3575, lng: 123.7333 },
  { patterns: [/bacacay/i, /misibis/i, /cagraray/i], lat: 13.2933, lng: 123.7917 },
  { patterns: [/tiwi/i, /joroan/i], lat: 13.4570, lng: 123.6800 },
  { patterns: [/santo domingo/i, /sto\.? domingo/i], lat: 13.2356, lng: 123.7744 },
  { patterns: [/polangui/i], lat: 13.2950, lng: 123.4860 },
  { patterns: [/oas/i], lat: 13.2580, lng: 123.5010 },
  { patterns: [/libon/i], lat: 13.3000, lng: 123.4350 },
  { patterns: [/jovellar/i, /quitinday/i], lat: 13.0760, lng: 123.6020 },
  { patterns: [/malilipot/i], lat: 13.3150, lng: 123.7380 },
  { patterns: [/malinao/i], lat: 13.4090, lng: 123.6930 },
  { patterns: [/manito/i], lat: 13.1200, lng: 123.8700 },
];

function cloudPostId(ownerUid: string, sourceId: string) {
  return `${ownerUid}_${sourceId}`;
}

function postCategory(item: StoredBusinessItem): BusinessPostCategory {
  return item.category ?? (item.kind === "Promotion" ? "Promotions" : item.kind === "Events" ? "Events" : "Photos & Videos");
}

function publicImageUrl(value: string) {
  return value.startsWith("data:") ? "" : value;
}

function mediaExtension(contentType: string, mediaType: "image" | "video") {
  const subtype = contentType.split("/")[1]?.split(";")[0]?.toLowerCase();
  if (subtype && /^[a-z0-9]+$/.test(subtype)) return subtype.replace("jpeg", "jpg").replace("quicktime", "mov");
  return mediaType === "video" ? "mp4" : "jpg";
}

async function uploadPostMedia(ownerUid: string, postId: string, mediaUrl: string, mediaType: "image" | "video") {
  if (!mediaUrl.startsWith("data:")) return mediaUrl;
  const response = await fetch(mediaUrl);
  if (!response.ok) throw new Error("That post media could not be prepared for upload.");
  const blob = await response.blob();
  const mediaRef = ref(storage, `business-posts/${ownerUid}/${postId}.${mediaExtension(blob.type, mediaType)}`);
  await uploadBytes(mediaRef, blob, { contentType: blob.type });
  return getDownloadURL(mediaRef);
}

function toBusinessPost(id: string, value: Omit<BusinessPost, "id">): BusinessPost {
  return { ...value, id };
}

export async function publishBusinessPost(input: PublishBusinessPostInput) {
  const id = cloudPostId(input.ownerUid, input.sourceId);
  const mediaUrl = await uploadPostMedia(input.ownerUid, id, input.mediaUrl, input.mediaType);
  const post: Omit<BusinessPost, "id"> = {
    ownerUid: input.ownerUid,
    sourceId: input.sourceId,
    businessId: `registered-${input.ownerUid}`,
    businessName: input.businessName.trim(),
    businessCategory: input.businessCategory.trim(),
    businessLocation: input.businessLocation.trim(),
    businessLogoUrl: publicImageUrl(input.businessLogoUrl),
    category: input.category,
    title: input.title.trim(),
    detail: input.detail.trim(),
    mediaUrl,
    mediaType: input.mediaType,
    createdAt: input.createdAt,
    ...(input.eventDate ? { eventDate: input.eventDate } : {}),
    ...(input.eventLocation ? { eventLocation: input.eventLocation.trim() } : {}),
    ...(input.promotionOffer ? { promotionOffer: input.promotionOffer.trim() } : {}),
    ...(input.promotionEnds ? { promotionEnds: input.promotionEnds } : {}),
  };
  await setDoc(doc(firestore, "businessPosts", id), post);
  return toBusinessPost(id, post);
}

export function subscribeToPublishedBusinessPosts(
  onPosts: (posts: BusinessPost[]) => void,
  onError: (error: Error) => void,
) {
  const postsQuery = query(businessPostsCollection, orderBy("createdAt", "desc"), limit(100));
  return onSnapshot(postsQuery, (snapshot) => {
    onPosts(snapshot.docs.map((snapshotDoc) => toBusinessPost(
      snapshotDoc.id,
      snapshotDoc.data() as Omit<BusinessPost, "id">,
    )));
  }, onError);
}

export function subscribeToOwnedBusinessPosts(
  ownerUid: string,
  onPosts: (posts: BusinessPost[]) => void,
  onError: (error: Error) => void,
) {
  const postsQuery = query(businessPostsCollection, where("ownerUid", "==", ownerUid));
  return onSnapshot(postsQuery, (snapshot) => {
    onPosts(snapshot.docs.map((snapshotDoc) => toBusinessPost(
      snapshotDoc.id,
      snapshotDoc.data() as Omit<BusinessPost, "id">,
    )).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, onError);
}

export async function migrateLocalBusinessPosts(ownerUid: string, page: StoredBusinessPage, items: StoredBusinessItem[]) {
  const results = await Promise.allSettled(items.map(async (item) => {
    const mediaUrl = item.mediaUrl ?? item.imageUrl ?? "";
    if (!mediaUrl) return;
    const id = cloudPostId(ownerUid, item.id);
    if ((await getDoc(doc(firestore, "businessPosts", id))).exists()) return;
    await publishBusinessPost({
      ownerUid,
      sourceId: item.id,
      businessName: page.name?.trim() || "Local business",
      businessCategory: page.category?.trim() || "Local Business",
      businessLocation: page.location?.trim() || "Legazpi City, Albay",
      businessLogoUrl: page.logoUrl ?? "",
      category: postCategory(item),
      title: item.title,
      detail: item.detail,
      mediaUrl,
      mediaType: item.mediaType ?? "image",
      eventDate: item.eventDate,
      eventLocation: item.eventLocation,
      promotionOffer: item.promotionOffer,
      promotionEnds: item.promotionEnds,
      createdAt: item.createdAt,
    });
  }));
  const failedCount = results.filter((result) => result.status === "rejected").length;
  if (failedCount > 0) throw new Error(`${failedCount} local business post(s) could not be migrated.`);
}

export function getAddressCoordinates(address: string, ownerId: string): { latitude: number; longitude: number } {
  const match = ALBAY_TOWN_COORDINATES.find((item) => item.patterns.some((pattern) => pattern.test(address)));
  const baseLat = match?.lat ?? 13.1391;
  const baseLng = match?.lng ?? 123.7438;

  let hash = 0;
  for (let i = 0; i < ownerId.length; i += 1) {
    hash = (hash * 31 + ownerId.charCodeAt(i)) & 0xffffffff;
  }
  const offsetLat = (((hash % 80) - 40) * 0.0002);
  const offsetLng = ((((hash >> 3) % 80) - 40) * 0.0002);

  return {
    latitude: Math.round((baseLat + offsetLat) * 10000) / 10000,
    longitude: Math.round((baseLng + offsetLng) * 10000) / 10000,
  };
}

export function readRegisteredSmallBusinesses() {
  const businesses: RegisteredSmallBusiness[] = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith("hilinga_business_page_v1:")) continue;

    try {
      const page = JSON.parse(localStorage.getItem(key) ?? "{}") as StoredBusinessPage;
      if (!page.name?.trim() || (page.businessScale ?? "Small business") !== "Small business") continue;
      const ownerId = key.slice(key.indexOf(":") + 1);
      const location = page.location?.trim() || "Legazpi City, Albay";
      const coords = getAddressCoordinates(location, ownerId);

      businesses.push({
        id: `registered-${ownerId}`,
        name: page.name.trim(),
        category: page.category?.trim() || "Local Business",
        location,
        hours: page.hours?.trim() || "Hours not provided",
        about: page.about?.trim() || "A locally registered small business on Hilinga.",
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    } catch {
      // Skip incomplete local business registrations.
    }
  }

  return businesses.sort((a, b) => a.name.localeCompare(b.name));
}

export function readPublishedBusinessPosts() {
  const posts: BusinessPost[] = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith("hilinga_business_items_v1:")) continue;

    const ownerId = key.slice(key.indexOf(":") + 1);
    try {
      const page = JSON.parse(localStorage.getItem(`hilinga_business_page_v1:${ownerId}`) ?? "{}") as StoredBusinessPage;
      const items = JSON.parse(localStorage.getItem(key) ?? "[]") as StoredBusinessItem[];
      if (!page.name?.trim() || !Array.isArray(items)) continue;

      for (const item of items) {
        const mediaUrl = item.mediaUrl ?? item.imageUrl ?? "";
        posts.push({
          ...item,
          id: `${ownerId}:${item.id}`,
          ownerUid: ownerId,
          sourceId: item.id,
          businessId: `registered-${ownerId}`,
          businessName: page.name.trim(),
          businessCategory: page.category?.trim() || "Local Business",
          businessLocation: page.location?.trim() || "Legazpi City, Albay",
          businessLogoUrl: page.logoUrl ?? "",
          category: postCategory(item),
          mediaUrl,
          mediaType: item.mediaType ?? "image",
        });
      }
    } catch {
      // Skip incomplete local business content.
    }
  }

  return posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
