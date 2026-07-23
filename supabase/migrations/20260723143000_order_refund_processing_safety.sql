begin;

alter table public.order_refund_items
  drop constraint if exists
    order_refund_items_status_valid;

alter table public.order_refund_items
  add constraint
    order_refund_items_status_valid
  check (
    status in (
      'pending',
      'refunded',
      'failed',
      'manual_review'
    )
  );

alter table public.order_refund_items
  drop constraint if exists
    order_refund_items_failure_reason_valid;

alter table public.order_refund_items
  add constraint
    order_refund_items_failure_reason_valid
  check (
    failure_reason is null
    or (
      status in (
        'failed',
        'manual_review'
      )
      and char_length(
        trim(failure_reason)
      ) > 0
    )
  );

comment on column
  public.order_refund_items.status is
  'Refund item lifecycle: pending, refunded, failed, or manual_review.';

create or replace function
  public.start_order_refund(
    target_order_refund_id uuid
  )
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  refund_status_value text;
  pending_item_count integer;
begin
  if target_order_refund_id is null then
    raise exception
      'The refund ID is required.';
  end if;

  select
    order_refunds.status
  into
    refund_status_value
  from public.order_refunds
  where order_refunds.id =
    target_order_refund_id
  for update;

  if not found then
    raise exception
      'The refund was not found.';
  end if;

  if refund_status_value = 'refunded' then
    return 0;
  end if;

  if refund_status_value = 'processing' then
    raise exception
      'This refund is already being processed.';
  end if;

  if refund_status_value =
    'manual_review' then
    raise exception
      'This refund requires manual review and cannot be retried automatically.';
  end if;

  if refund_status_value not in (
    'pending',
    'failed'
  ) then
    raise exception
      'This refund cannot be started from its current status.';
  end if;

  if refund_status_value = 'failed' then
    update public.order_refund_items
    set
      status = 'pending',
      failure_reason = null,
      refunded_at = null,
      updated_at = now()
    where order_refund_items.order_refund_id =
      target_order_refund_id
      and order_refund_items.status =
        'failed';
  end if;

  update public.order_refunds
  set
    status = 'processing',
    started_at = now(),
    failed_at = null,
    last_error = null,
    updated_at = now()
  where order_refunds.id =
    target_order_refund_id
    and order_refunds.status in (
      'pending',
      'failed'
    );

  if not found then
    raise exception
      'The refund could not be started safely.';
  end if;

  select
    count(*)
  into
    pending_item_count
  from public.order_refund_items
  where order_refund_items.order_refund_id =
    target_order_refund_id
    and order_refund_items.status =
      'pending';

  if pending_item_count = 0 then
    raise exception
      'The refund has no pending items to process.';
  end if;

  return pending_item_count;
end;
$function$;

create or replace function
  public.mark_order_refund_item_manual_review(
    target_order_refund_item_id uuid,
    provider_response_value jsonb,
    failure_reason_value text
  )
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_order_refund_id uuid;
  current_item_status text;
  current_refund_status text;
begin
  if target_order_refund_item_id
    is null then
    raise exception
      'The refund item ID is required.';
  end if;

  if failure_reason_value is null
    or char_length(
      trim(failure_reason_value)
    ) = 0 then
    raise exception
      'A manual-review reason is required.';
  end if;

  select
    order_refund_items.order_refund_id,
    order_refund_items.status
  into
    target_order_refund_id,
    current_item_status
  from public.order_refund_items
  where order_refund_items.id =
    target_order_refund_item_id
  for update;

  if not found then
    raise exception
      'The refund item was not found.';
  end if;

  select
    order_refunds.status
  into
    current_refund_status
  from public.order_refunds
  where order_refunds.id =
    target_order_refund_id
  for update;

  if not found then
    raise exception
      'The parent refund was not found.';
  end if;

  if current_refund_status =
    'refunded' then
    return current_refund_status;
  end if;

  if current_item_status =
    'refunded' then
    return current_refund_status;
  end if;

  update public.order_refund_items
  set
    status = 'manual_review',
    provider_response =
      provider_response_value,
    failure_reason =
      trim(failure_reason_value),
    refunded_at = null,
    updated_at = now()
  where order_refund_items.id =
    target_order_refund_item_id;

  update public.order_refunds
  set
    status = 'manual_review',
    failed_at = coalesce(
      failed_at,
      now()
    ),
    last_error =
      trim(failure_reason_value),
    updated_at = now()
  where order_refunds.id =
    target_order_refund_id
    and order_refunds.status <>
      'refunded';

  if not found then
    raise exception
      'The refund could not be marked for manual review safely.';
  end if;

  return 'manual_review';
end;
$function$;

create or replace function
  public.record_order_refund_item_result(
    target_order_refund_item_id uuid,
    succeeded boolean,
    provider_response_value jsonb,
    failure_reason_value text
      default null
  )
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_order_refund_id uuid;
  current_item_status text;
  current_refund_status text;

  total_item_count integer;
  refunded_item_count integer;
  failed_item_count integer;
  manual_review_item_count integer;
  refunded_amount_value numeric;

  next_refund_status text;
  next_error_value text;
begin
  if target_order_refund_item_id
    is null then
    raise exception
      'The refund item ID is required.';
  end if;

  if succeeded is null then
    raise exception
      'The refund result is required.';
  end if;

  if succeeded is false
    and (
      failure_reason_value is null
      or char_length(
        trim(failure_reason_value)
      ) = 0
    ) then
    raise exception
      'A failure reason is required for a failed refund item.';
  end if;

  select
    order_refund_items.order_refund_id,
    order_refund_items.status
  into
    target_order_refund_id,
    current_item_status
  from public.order_refund_items
  where order_refund_items.id =
    target_order_refund_item_id
  for update;

  if not found then
    raise exception
      'The refund item was not found.';
  end if;

  select
    order_refunds.status
  into
    current_refund_status
  from public.order_refunds
  where order_refunds.id =
    target_order_refund_id
  for update;

  if not found then
    raise exception
      'The parent refund was not found.';
  end if;

  if current_refund_status =
    'refunded' then
    return current_refund_status;
  end if;

  if current_refund_status =
    'manual_review' then
    return current_refund_status;
  end if;

  if current_item_status =
      'refunded'
    and succeeded is true then
    return current_refund_status;
  end if;

  if current_item_status =
      'refunded'
    and succeeded is false then
    raise exception
      'A successfully refunded item cannot be changed to failed.';
  end if;

  if current_item_status =
    'manual_review' then
    return 'manual_review';
  end if;

  if succeeded is true then
    update public.order_refund_items
    set
      status = 'refunded',
      provider_response =
        provider_response_value,
      failure_reason = null,
      refunded_at = now(),
      updated_at = now()
    where order_refund_items.id =
      target_order_refund_item_id;
  else
    update public.order_refund_items
    set
      status = 'failed',
      provider_response =
        provider_response_value,
      failure_reason =
        trim(failure_reason_value),
      refunded_at = null,
      updated_at = now()
    where order_refund_items.id =
      target_order_refund_item_id;
  end if;

  select
    count(*),

    count(*) filter (
      where order_refund_items.status =
        'refunded'
    ),

    count(*) filter (
      where order_refund_items.status =
        'failed'
    ),

    count(*) filter (
      where order_refund_items.status =
        'manual_review'
    ),

    coalesce(
      sum(
        order_refund_items.amount
      ) filter (
        where order_refund_items.status =
          'refunded'
      ),
      0
    )
  into
    total_item_count,
    refunded_item_count,
    failed_item_count,
    manual_review_item_count,
    refunded_amount_value
  from public.order_refund_items
  where order_refund_items.order_refund_id =
    target_order_refund_id;

  if total_item_count = 0 then
    raise exception
      'The refund has no items.';
  end if;

  if manual_review_item_count > 0 then
    next_refund_status :=
      'manual_review';

  elsif refunded_item_count =
    total_item_count then
    next_refund_status :=
      'processing';

  elsif refunded_item_count > 0
    and failed_item_count > 0 then
    next_refund_status :=
      'manual_review';

  elsif failed_item_count > 0 then
    next_refund_status :=
      'failed';

  else
    next_refund_status :=
      'processing';
  end if;

  next_error_value :=
    nullif(
      trim(
        coalesce(
          failure_reason_value,
          ''
        )
      ),
      ''
    );

  update public.order_refunds
  set
    status = next_refund_status,

    refunded_amount = round(
      refunded_amount_value,
      2
    ),

    failed_at =
      case
        when next_refund_status in (
          'failed',
          'manual_review'
        )
        then coalesce(
          failed_at,
          now()
        )
        else null
      end,

    last_error =
      case
        when next_refund_status in (
          'failed',
          'manual_review'
        )
        then coalesce(
          next_error_value,
          last_error,
          'Manual review is required.'
        )
        else null
      end,

    updated_at = now()
  where order_refunds.id =
    target_order_refund_id;

  return next_refund_status;
end;
$function$;

revoke all
on function public.start_order_refund(uuid)
from public;

revoke all
on function public.start_order_refund(uuid)
from anon;

revoke all
on function public.start_order_refund(uuid)
from authenticated;

grant execute
on function public.start_order_refund(uuid)
to service_role;

revoke all
on function
  public.mark_order_refund_item_manual_review(
    uuid,
    jsonb,
    text
  )
from public;

revoke all
on function
  public.mark_order_refund_item_manual_review(
    uuid,
    jsonb,
    text
  )
from anon;

revoke all
on function
  public.mark_order_refund_item_manual_review(
    uuid,
    jsonb,
    text
  )
from authenticated;

grant execute
on function
  public.mark_order_refund_item_manual_review(
    uuid,
    jsonb,
    text
  )
to service_role;

revoke all
on function
  public.record_order_refund_item_result(
    uuid,
    boolean,
    jsonb,
    text
  )
from public;

revoke all
on function
  public.record_order_refund_item_result(
    uuid,
    boolean,
    jsonb,
    text
  )
from anon;

revoke all
on function
  public.record_order_refund_item_result(
    uuid,
    boolean,
    jsonb,
    text
  )
from authenticated;

grant execute
on function
  public.record_order_refund_item_result(
    uuid,
    boolean,
    jsonb,
    text
  )
to service_role;

commit;