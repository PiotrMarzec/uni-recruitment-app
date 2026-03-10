CREATE TYPE "public"."email_queue_status" AS ENUM('pending', 'processing', 'sent', 'failed');

CREATE TABLE "email_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "from" text NOT NULL,
  "to" text NOT NULL,
  "subject" text NOT NULL,
  "html" text NOT NULL,
  "status" "email_queue_status" DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone
);
