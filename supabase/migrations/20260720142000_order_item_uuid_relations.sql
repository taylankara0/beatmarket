begin;

do $migration$
declare
  beat_id_type text;
  license_id_type text;
begin
  select column_type.udt_name
  into beat_id_type
  from information_schema.columns column_type
  where column_type.table_schema = 'public'
    and column_type.table_name = 'order_items'
    and column_type.column_name = 'beat_id';

  select column_type.udt_name
  into license_id_type
  from information_schema.columns column_type
  where column_type.table_schema = 'public'
    and column_type.table_name = 'order_items'
    and column_type.column_name = 'license_id';

  if beat_id_type is null or license_id_type is null then
    raise exception
      'order_items.beat_id or order_items.license_id does not exist.';
  end if;

  if beat_id_type = 'text'
    and license_id_type = 'text'
  then
    update public.order_items oi
    set
      license_id = l.id::text,
      license_name = l.name
    from public.licenses l
    where oi.license_id is null
      and l.beat_id::text = oi.beat_id
      and lower(l.name) = lower(
        coalesce(
          nullif(oi.license_name, ''),
          oi.item_snapshot ->> 'licenseType'
        )
      );

    if exists (
      select 1
      from public.order_items
      where beat_id is null
        or beat_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
      raise exception
        'order_items contains null or invalid beat_id values.';
    end if;

    if exists (
      select 1
      from public.order_items
      where license_id is null
        or license_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
      raise exception
        'order_items contains null or invalid license_id values.';
    end if;

    if exists (
      select 1
      from public.order_items oi
      where not exists (
        select 1
        from public.beats b
        where b.id = oi.beat_id::uuid
      )
    ) then
      raise exception
        'order_items contains beat references that do not exist.';
    end if;

    if exists (
      select 1
      from public.order_items oi
      where not exists (
        select 1
        from public.licenses l
        where l.id = oi.license_id::uuid
      )
    ) then
      raise exception
        'order_items contains license references that do not exist.';
    end if;

    alter table public.order_items
      alter column beat_id type uuid
        using beat_id::uuid,
      alter column license_id type uuid
        using license_id::uuid;

  elsif beat_id_type = 'uuid'
    and license_id_type = 'uuid'
  then
    if exists (
      select 1
      from public.order_items
      where beat_id is null
        or license_id is null
    ) then
      raise exception
        'order_items contains null beat_id or license_id values.';
    end if;

    if exists (
      select 1
      from public.order_items oi
      where not exists (
        select 1
        from public.beats b
        where b.id = oi.beat_id
      )
    ) then
      raise exception
        'order_items contains beat references that do not exist.';
    end if;

    if exists (
      select 1
      from public.order_items oi
      where not exists (
        select 1
        from public.licenses l
        where l.id = oi.license_id
      )
    ) then
      raise exception
        'order_items contains license references that do not exist.';
    end if;

  else
    raise exception
      'Unexpected order_items ID column types: beat_id=%, license_id=%',
      beat_id_type,
      license_id_type;
  end if;
end;
$migration$;

alter table public.order_items
  alter column beat_id set not null,
  alter column license_id set not null;

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_items_beat_id_fkey'
      and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_beat_id_fkey
      foreign key (beat_id)
      references public.beats(id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_items_license_id_fkey'
      and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_license_id_fkey
      foreign key (license_id)
      references public.licenses(id)
      on delete restrict;
  end if;
end;
$constraints$;

create index if not exists order_items_beat_id_idx
  on public.order_items(beat_id);

create index if not exists order_items_license_id_idx
  on public.order_items(license_id);

commit;