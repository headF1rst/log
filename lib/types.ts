export interface IProfile {
  name: string;
  description: string;
  email: string;
  instagram: string;
  image: string;
  github: string;
}

export interface IPostData {
  id: string;
  title: string;
  category: string;
  section?: string;
  thumbnail: string;
  tags: string;
  date: string;
  preview: string;
  description: string;
  searchKeywords: string;
  lang?: string;
  translationSlug?: string;
}

export interface ITag {
  name: string;
  count: number;
}
