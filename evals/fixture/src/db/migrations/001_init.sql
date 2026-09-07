create table firms (id serial primary key, name text not null, stripe_customer_id text);
create table users (id serial primary key, firm_id int references firms(id), email text, role text);
create table clients (id serial primary key, firm_id int references firms(id), name text, email text);
create table engagements (id serial primary key, firm_id int references firms(id), client_id int references clients(id), status text, letter_s3_key text, stripe_invoice_id text);
