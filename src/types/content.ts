export type ContentType = 'article' | 'video' | 'infographic' | 'quiz';
export type ContentStatus = 'draft' | 'under_review' | 'approved' | 'published' | 'archived';

export interface Content {
  id: string;
  projectId: string;
  title: string;
  type: ContentType;
  status: ContentStatus;
  author: string;
  content: string;
  tags: string[];
  readCount: number;
  likeCount: number;
  bookmarkCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface ContentFilter {
  status?: ContentStatus;
  projectId?: string;
  type?: ContentType;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateContentDTO {
  projectId: string;
  title: string;
  type: ContentType;
  content: string;
  tags: string[];
}

export interface UpdateContentDTO {
  title?: string;
  content?: string;
  tags?: string[];
  status?: ContentStatus;
}
