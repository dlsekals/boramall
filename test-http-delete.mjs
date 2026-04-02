async function run() {
  const nickname = '@htt1';
  const url = `http://localhost:3000/api/users?nickname=${encodeURIComponent(nickname)}`;
  const res = await fetch(url, { method: 'DELETE' });
  const data = await res.json();
  console.log('HTTP DELETE RESULT:', res.status, data);
}
run();
