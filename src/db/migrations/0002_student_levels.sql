ALTER TYPE "public"."student_level" ADD VALUE 'bachelor_1';--> statement-breakpoint
ALTER TYPE "public"."student_level" ADD VALUE 'bachelor_2';--> statement-breakpoint
ALTER TYPE "public"."student_level" ADD VALUE 'bachelor_3';--> statement-breakpoint
ALTER TYPE "public"."student_level" ADD VALUE 'master_1';--> statement-breakpoint
ALTER TYPE "public"."student_level" ADD VALUE 'master_2';--> statement-breakpoint
ALTER TYPE "public"."student_level" ADD VALUE 'master_3';--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "not_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recruitments" ADD COLUMN "eligible_levels" text DEFAULT '["bachelor_1","bachelor_2","bachelor_3","master_1","master_2","master_3"]' NOT NULL;
