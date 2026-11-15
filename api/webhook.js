async function sendReply(cfg, phoneNumberId, to, row) {
  if (row.kind === 'text') return sendText(cfg, phoneNumberId, to, row.content);

  if (row.kind === 'album') {
    const ids = row.media_ids || [];
    if (ids.length === 0) return;
    const inList = ids.map(id => `"${id}"`).join(',');
    const mr = await fetch(
      `${cfg.url}/rest/v1/media_files?id=in.(${ids.join(',')})&select=id,kind,storage_path`,
      { headers: sbHeaders(cfg.key) }
    );
    const files = await mr.json();
    if (!Array.isArray(files)) return;

    // نحافظ على الترتيب الذي أدخله التاجر
    const byId = new Map(files.map(f => [f.id, f]));
    for (const id of ids) {
      const mf = byId.get(id);
      if (mf) await sendMediaReply(cfg, phoneNumberId, to, mf.kind, mf);
    }
    return;
  }

  const mr = await fetch(
    `${cfg.url}/rest/v1/media_files?id=eq.${row.media_id}&select=kind,storage_path`,
    { headers: sbHeaders(cfg.key) }
  );
  const [mf] = await mr.json();
  if (!mf) return;
  return sendMediaReply(cfg, phoneNumberId, to, mf.kind, mf);
}
