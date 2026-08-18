CREATE TABLE applicant_notification_reads (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_id text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notification_id),
  CONSTRAINT applicant_notification_reads_notification_id_check CHECK (
    char_length(notification_id) >= 32
  )
);

CREATE INDEX applicant_notification_reads_user_read_at_idx
  ON applicant_notification_reads(user_id, read_at DESC);
