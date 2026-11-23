export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type RoleCode = "ADMIN" | "CLIENT" | "COUNSELOR";
export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type CareRelationshipStatus =
  | "PENDING"
  | "ACTIVE"
  | "REJECTED"
  | "REVOKED";
export type JournalEntryType =
  | "THOUGHT_RECORD"
  | "PANIC_LOG"
  | "GRATITUDE"
  | "MOOD_CHECK"
  | "FREE_JOURNAL";
export type JournalVisibility =
  | "PRIVATE"
  | "COUNSELOR"
  | "ORGANIZATION"
  | "PUBLIC";

export interface ApiRole {
  id: string;
  code: RoleCode;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface ApiUser {
  id: string;
  email: string;
  username: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: UserStatus;
  role: ApiRole;
}

export interface AuthResponse {
  user: ApiUser;
  accessToken: string;
  refreshToken: string;
}

export interface CurrentUserResponse {
  userId: string;
  email: string;
  role: RoleCode;
}

export interface Diary {
  id: string;
  userId: string;
  entryType: JournalEntryType;
  primaryEmotionId: string | null;
  intensityBefore: number | null;
  intensityAfter: number | null;
  visibility: JournalVisibility;
  content: JsonValue;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CounselorDiary {
  id: string;
  createdAt: string;
  updatedAt: string;
  entryType: JournalEntryType;
  content: JsonValue;
  primaryEmotion: { id: string; code: string } | null;
  intensityBefore: number | null;
  intensityAfter: number | null;
  client: { id: string; firstName: string; lastName: string };
}

export interface CounselorDiaryPage {
  entries: CounselorDiary[];
  nextCursor: string | null;
}

export interface Emotion {
  id: string;
  code: string;
  parentId: string | null;
}

export interface RelationshipUser {
  id: string;
  email: string;
  username: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: UserStatus;
  role: Pick<ApiRole, "code">;
}

export interface Relationship {
  id: string;
  counselorId: string;
  clientId: string;
  status: CareRelationshipStatus;
  requestedAt: string;
  respondedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  counselor: RelationshipUser;
  client: RelationshipUser;
}

export interface CounselorRecipient {
  relationshipId: string;
  counselor: {
    id: string;
    firstName: string;
    lastName: string;
    username: string | null;
  };
}

export interface ShareableCounselorsResponse {
  counselors: CounselorRecipient[];
}

export interface DiarySharingState {
  shareVersion: string;
  recipients: CounselorRecipient[];
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  username?: string;
  phone?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface CreateDiaryInput {
  entryType: JournalEntryType;
  content: JsonValue;
  primaryEmotionId?: string;
  intensityBefore?: number;
  intensityAfter?: number;
  visibility?: JournalVisibility;
  recipientRelationshipIds?: string[];
}

export type UpdateDiaryInput = Omit<Partial<CreateDiaryInput>, "primaryEmotionId"> & {
  primaryEmotionId?: string | null;
  shareVersion?: string;
};
