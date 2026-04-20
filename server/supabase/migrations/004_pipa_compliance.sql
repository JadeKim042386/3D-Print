-- PIPA compliance: allow users to delete their own data (right to erasure)
create policy "Users can delete own profile"
  on public.users for delete using (auth.uid() = id);

-- PIPA compliance: allow users to delete their own orders
create policy "Users can delete own orders"
  on public.orders for delete using (auth.uid() = user_id);

-- PIPA compliance: allow users to delete their own consents
create policy "Users can delete own consents"
  on public.consents for delete using (auth.uid() = user_id);

-- PIPA compliance: allow users to delete their own print orders
create policy "Users can delete own print orders"
  on public.print_orders for delete using (auth.uid() = user_id);
