create table profiles(
    id uuid primary key references auth.users on delete cascade not null,
    full_name text not null,
    created_at timestamp with time zone default timezone('utc', now()) not null,
    updated_at timestamp with time zone default timezone('utc', now()) not null
);

create table user_preferences(
    id uuid primary key default gen_random_uuid(),
    user_id uuid references profiles(id) on delete cascade not null,
    interests text[] not null,
    vr_experience text not null,
    inspiration_goal text not null,
    session_length text not null,
    created_at timestamp with time zone default timezone('utc', now()) not null,
    updated_at timestamp with time zone default timezone('utc', now()) not null
);