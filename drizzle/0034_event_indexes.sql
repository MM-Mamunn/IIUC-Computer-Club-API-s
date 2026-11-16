CREATE INDEX IF NOT EXISTS "executives_number_idx" ON "executives" USING btree ("number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "certificates_event_id_idx" ON "certificates" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "certificates_recipient_email_idx" ON "certificates" USING btree ("recipient_email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_duties_user_id_idx" ON "event_duties" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_expenses_event_id_idx" ON "event_expenses" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_managers_user_id_idx" ON "event_managers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_registrations_user_id_idx" ON "event_registrations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_registrations_sslcommerz_tran_id_idx" ON "event_registrations" USING btree ("sslcommerz_tran_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_registrations_sslcommerz_val_id_idx" ON "event_registrations" USING btree ("sslcommerz_val_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_claims_event_id_idx" ON "expense_claims" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_claims_user_id_idx" ON "expense_claims" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refund_requests_user_id_idx" ON "refund_requests" USING btree ("user_id");