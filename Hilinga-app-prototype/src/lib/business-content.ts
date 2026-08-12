export type BusinessPostCategory = "Photos & Videos" | "Events" | "Promotions";

export type BusinessPost = {
  id: string;
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
};

type StoredBusinessItem = Omit<BusinessPost, "businessId" | "businessName" | "businessCategory" | "businessLocation" | "businessLogoUrl" | "category" | "mediaUrl" | "mediaType"> & {
  category?: BusinessPostCategory;
  kind?: string;
  imageUrl?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
};

export const BUSINESS_CONTENT_CHANGED_EVENT = "hilinga:business-content-changed";

export function readRegisteredSmallBusinesses() {
  const businesses: RegisteredSmallBusiness[] = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith("hilinga_business_page_v1:")) continue;

    try {
      const page = JSON.parse(localStorage.getItem(key) ?? "{}") as StoredBusinessPage;
      if (!page.name?.trim() || (page.businessScale ?? "Small business") !== "Small business") continue;
      const ownerId = key.slice(key.indexOf(":") + 1);
      businesses.push({
        id: `registered-${ownerId}`,
        name: page.name.trim(),
        category: page.category?.trim() || "Local Business",
        location: page.location?.trim() || "Legazpi City, Albay",
        hours: page.hours?.trim() || "Hours not provided",
        about: page.about?.trim() || "A locally registered small business on Hilinga.",
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
          businessId: `registered-${ownerId}`,
          businessName: page.name.trim(),
          businessCategory: page.category?.trim() || "Local Business",
          businessLocation: page.location?.trim() || "Legazpi City, Albay",
          businessLogoUrl: page.logoUrl ?? "",
          category: item.category ?? (item.kind === "Promotion" ? "Promotions" : item.kind === "Events" ? "Events" : "Photos & Videos"),
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
