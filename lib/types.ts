export type Project={id:string;name:string;repository_full_name:string|null;website_url:string|null;vercel_project_id:string|null;posthog_project_id:string|null;gsc_property:string|null;created_at:string};
export type Session={id:string;app:string;category:string;started_at:string;ended_at:string;project_id:string|null};
export type Metric={id:string;project_id:string|null;provider:string;metric:string;day:string;value:number;dimensions:Record<string,string|number>};
export type SeoSnapshot={id:string;project_id:string;page_url:string;checked_at:string;status:number|null;title:string|null;description:string|null;canonical:string|null;issues:string[]};
