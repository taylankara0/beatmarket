revoke execute
on function public.request_watermark_processing()
from public, anon, authenticated;

revoke execute
on function public.rls_auto_enable()
from public, anon, authenticated;

revoke execute
on function public.set_order_refund_updated_at()
from public, anon, authenticated;

revoke execute
on function public.set_profile_updated_at()
from public, anon, authenticated;