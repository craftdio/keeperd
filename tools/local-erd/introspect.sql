WITH relations AS (
 SELECT c.oid, n.nspname AS schema, c.relname AS name, c.relkind,
        obj_description(c.oid) AS comments
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','p','v','m') AND n.nspname NOT IN ('pg_catalog','information_schema')
 AND n.nspname NOT LIKE 'pg_toast%'
)
SELECT json_build_object(
 'tables', (SELECT coalesce(json_agg(r ORDER BY schema,name),'[]') FROM relations r),
 'columns', (SELECT coalesce(json_agg(x ORDER BY oid,num),'[]') FROM (
  SELECT r.oid,a.attnum AS num,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,
   NOT a.attnotnull AS nullable, a.attidentity <> '' AS increment,
   pg_get_expr(d.adbin,d.adrelid) AS "default", col_description(r.oid,a.attnum) AS comments,
   EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=r.oid AND k.contype='p' AND a.attnum=ANY(k.conkey)) AS pk,
   EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=r.oid AND i.indisunique AND i.indnkeyatts=1 AND i.indpred IS NULL AND a.attnum=ANY(i.indkey)) AS "unique"
  FROM relations r JOIN pg_attribute a ON a.attrelid=r.oid
  LEFT JOIN pg_attrdef d ON d.adrelid=r.oid AND d.adnum=a.attnum
  WHERE a.attnum>0 AND NOT a.attisdropped
 ) x),
 'indexes', (SELECT coalesce(json_agg(x),'[]') FROM (
  SELECT r.oid,c.relname AS name,i.indisunique AS "unique",i.indisprimary AS pk,
   i.indkey::smallint[] AS fields,am.amname AS type,pg_get_indexdef(i.indexrelid) AS definition
  FROM relations r JOIN pg_index i ON i.indrelid=r.oid
  JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_am am ON am.oid=c.relam
 ) x),
 'foreignKeys', (SELECT coalesce(json_agg(x),'[]') FROM (
  SELECT k.conrelid AS source,k.confrelid AS target,k.conname AS name,
   k.conkey AS sources,k.confkey AS targets
  FROM pg_constraint k JOIN relations r ON r.oid=k.conrelid WHERE k.contype='f'
 ) x),
 'checks', (SELECT coalesce(json_agg(x),'[]') FROM (
  SELECT k.conrelid AS oid,k.conname AS name,pg_get_expr(k.conbin,k.conrelid) AS expression
  FROM pg_constraint k JOIN relations r ON r.oid=k.conrelid WHERE k.contype='c'
 ) x)
);
