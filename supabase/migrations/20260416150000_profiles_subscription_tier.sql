-- Weekly submission caps read from profiles.subscription_tier (free | pro | premium).
-- Stripe webhook + checkout sync update this when users subscribe.

alter table profiles add column if not exists subscription_tier text default 'free';
update profiles set subscription_tier = 'free' where subscription_tier is null;
