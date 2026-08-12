import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";

import { firestore } from "@/lib/firebase";

export const experienceCategories = [
  "Place",
  "Restaurant",
  "Cafe",
  "Accommodation",
  "Shop",
  "Event",
  "Activity",
] as const;

export type ExperienceCategory = (typeof experienceCategories)[number];

export type CommunityPost = {
  id: string;
  authorUid: string;
  authorName: string;
  authorAvatarUrl: string | null;
  placeName: string;
  location: string;
  category: ExperienceCategory;
  experience: string;
  rating: number | null;
  createdAt: Timestamp | null;
};

export type NewCommunityPost = Pick<
  CommunityPost,
  | "authorUid"
  | "authorName"
  | "authorAvatarUrl"
  | "placeName"
  | "location"
  | "category"
  | "experience"
  | "rating"
>;

const postsCollection = collection(firestore, "communityPosts");

export function subscribeToCommunityPosts(
  onPosts: (posts: CommunityPost[]) => void,
  onError: (error: Error) => void,
) {
  const postsQuery = query(postsCollection, orderBy("createdAt", "desc"), limit(100));
  return onSnapshot(postsQuery, (snapshot) => {
    onPosts(snapshot.docs.map((snapshotDoc) => ({
      ...(snapshotDoc.data() as Omit<CommunityPost, "id">),
      id: snapshotDoc.id,
    })));
  }, onError);
}

export async function createCommunityPost(input: NewCommunityPost) {
  await addDoc(postsCollection, {
    ...input,
    placeName: input.placeName.trim(),
    location: input.location.trim(),
    experience: input.experience.trim(),
    createdAt: serverTimestamp(),
  });
}

export async function deleteCommunityPost(postId: string) {
  await deleteDoc(doc(postsCollection, postId));
}
