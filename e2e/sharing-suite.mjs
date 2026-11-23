import { expect } from '@playwright/test';

export async function runSharingSuite({ browser, origin, backendUrl, accountPassword }) {
  let step = 'initialization';
  const contexts = [];
  async function login(email, path) {
    const context = await browser.newContext();
    contexts.push(context);
    const page = await context.newPage();
    await page.goto(`${origin}/login`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(accountPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(`${origin}${path}`);
    return page;
  }
  async function api(page, path, options = {}) {
    return await page.evaluate(async ({ backendUrl, path, options }) => {
      const session = JSON.parse(sessionStorage.getItem('thought-diary.auth-session'));
      const response = await fetch(`${backendUrl}${path}`, {
        method: options.method || 'GET',
        headers: { Authorization: `Bearer ${session.accessToken}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });
      return { status: response.status, body: await response.json() };
    }, { backendUrl, path, options });
  }
  const content = (page) => page.getByPlaceholder('Begin wherever you are…');
  async function save(page, id) {
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.waitForURL(`${origin}/diaries/${id}`);
  }
  async function edit(page, id) {
    await page.goto(`${origin}/diaries/${id}/edit`);
    await expect(content(page)).toBeVisible();
  }
  async function list(page) {
    await page.goto(`${origin}/counselor/diaries`);
    await expect(page.getByRole('heading', { name: 'Shared diaries' })).toBeVisible();
    await expect(page.getByText('Loading shared diaries…')).toHaveCount(0);
  }
  async function requestRelationship(counselor, clientId, client, name) {
    await counselor.goto(`${origin}/counselor/dashboard`);
    await counselor.getByLabel('Client ID (UUID)').fill(clientId);
    await counselor.getByRole('button', { name: 'Send request' }).click();
    await expect(counselor.getByText('Relationship request sent.')).toBeVisible();
    await client.goto(`${origin}/dashboard`);
    const card = client.getByRole('region', { name: 'Incoming requests' }).locator('article').filter({ hasText: name });
    await card.getByRole('button', { name: 'Accept' }).click();
    await expect(client.getByText('Request accepted.')).toBeVisible();
  }
  try {
    step = 'independent logins and relationships';
    const client = await login('client@example.test', '/dashboard');
    const counselorA = await login('counselor@example.test', '/counselor/dashboard');
    const counselorB = await login('other-counselor@example.test', '/counselor/dashboard');
    const clientId = await client.evaluate(() => JSON.parse(sessionStorage.getItem('thought-diary.auth-session')).user.id);
    await requestRelationship(counselorA, clientId, client, 'CounselorA');
    await requestRelationship(counselorB, clientId, client, 'CounselorB');

    step = 'private creation and counselor denial';
    await client.goto(`${origin}/diaries/new`);
    await content(client).fill('Synthetic private entry');
    const createdResponse = client.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/diaries'));
    await client.getByRole('button', { name: 'Save entry' }).click();
    step = 'private creation: await create response';
    const created = await createdResponse;
    expect(created.status()).toBe(201);
    const { id } = await created.json();
    step = 'private creation: await detail navigation';
    expect((await api(client, `/diaries/${id}`)).status).toBe(200);
    step = 'private creation: verify counselor denial';
    for (const counselor of [counselorA, counselorB]) {
      await list(counselor);
      await expect(counselor.getByText('Synthetic private entry')).toHaveCount(0);
      expect((await api(counselor, `/counselor/diaries/${id}`)).status).toBe(404);
    }
    console.log('PASS private creation and both counselor denials');

    step = 'explicit sharing and authorization';
    step = 'explicit sharing: open edit';
    await edit(client, id);
    step = 'explicit sharing: select visibility';
    await client.getByLabel('Visibility').selectOption('COUNSELOR');
    step = 'explicit sharing: select recipient';
    await client.getByRole('checkbox', { name: 'CounselorA User' }).check();
    await save(client, id);
    step = 'explicit sharing: counselor list';
    await list(counselorA);
    await counselorA.getByRole('link', { name: /Synthetic private entry/ }).click();
    step = 'explicit sharing: counselor detail';
    await expect(counselorA.getByText('Synthetic private entry')).toBeVisible();
    step = 'explicit sharing: other counselor denial';
    await list(counselorB);
    await expect(counselorB.getByText('Synthetic private entry')).toHaveCount(0);
    expect((await api(counselorB, `/counselor/diaries/${id}`)).status).toBe(404);
    expect((await api(counselorB, '/counselor/diaries')).body.entries.some((entry) => entry.id === id)).toBe(false);
    console.log('PASS selected counselor access and other counselor denial');

    step = 'lookup failure and content-only save';
    const before = (await api(client, `/diaries/${id}/shares`)).body;
    await edit(client, id);
    await client.route('**/relationships/shareable-counselors', (route) => route.fulfill({ status: 503, json: { message: 'Synthetic lookup failure' } }), { times: 1 });
    await client.getByRole('button', { name: 'Load counselor options' }).click();
    await expect(client.getByText(/Could not load eligible counselors/)).toBeVisible();
    await content(client).fill('Synthetic content-only edit');
    const patchRequest = client.waitForRequest((request) => request.method() === 'PATCH' && request.url().endsWith(`/diaries/${id}`));
    await save(client, id);
    const patch = (await patchRequest).postDataJSON();
    expect(patch).not.toHaveProperty('visibility'); expect(patch).not.toHaveProperty('recipientRelationshipIds'); expect(patch).not.toHaveProperty('shareVersion');
    expect((await api(client, `/diaries/${id}/shares`)).body).toEqual(before);
    console.log('PASS content-only edit survives lookup failure and preserves sharing version');

    step = 'lookup retry and recipient removal';
    await edit(client, id);
    await client.route('**/relationships/shareable-counselors', (route) => route.fulfill({ status: 503, json: { message: 'Synthetic lookup failure' } }), { times: 1 });
    await client.getByRole('button', { name: 'Load counselor options' }).click();
    await expect(client.getByText(/Could not load eligible counselors/)).toBeVisible();
    await client.getByRole('button', { name: 'Retry counselor lookup' }).click();
    const selected = client.getByRole('checkbox', { name: 'CounselorA User' });
    await expect(selected).toBeChecked();
    await selected.uncheck();
    const removalRequest = client.waitForRequest((request) => request.method() === 'PATCH' && request.url().endsWith(`/diaries/${id}`));
    await save(client, id);
    expect((await removalRequest).postDataJSON()).toMatchObject({ recipientRelationshipIds: [], shareVersion: before.shareVersion });
    for (const counselor of [counselorA, counselorB]) expect((await api(counselor, `/counselor/diaries/${id}`)).status).toBe(404);
    await list(counselorA); await expect(counselorA.getByText('Synthetic content-only edit')).toHaveCount(0);
    console.log('PASS lookup retry, preserved selection, versioned removal and immediate denial');

    step = 'relationship reconnection and explicit resharing';
    await client.goto(`${origin}/dashboard`);
    client.once('dialog', (dialog) => dialog.accept());
    await client.getByRole('region', { name: 'Active relationships' }).locator('article').filter({ hasText: 'CounselorA' }).getByRole('button', { name: 'Revoke' }).click();
    await expect(client.getByText('Relationship revoked.')).toBeVisible();
    await requestRelationship(counselorA, clientId, client, 'CounselorA');
    expect((await api(counselorA, `/counselor/diaries/${id}`)).status).toBe(404);
    await edit(client, id);
    await client.getByRole('button', { name: 'Load counselor options' }).click();
    await client.getByRole('checkbox', { name: 'CounselorA User' }).check();
    await save(client, id);
    expect((await api(counselorA, `/counselor/diaries/${id}`)).status).toBe(200);
    console.log('PASS reconnect does not restore access; explicit resharing restores it');

    step = 'optimistic concurrency and conflict recovery';
    const client2 = await login('client@example.test', '/dashboard');
    await edit(client, id); await edit(client2, id);
    await client.getByRole('button', { name: 'Load counselor options' }).click();
    await client2.getByRole('button', { name: 'Load counselor options' }).click();
    await expect(client.getByRole('checkbox', { name: 'CounselorA User' })).toBeChecked();
    await expect(client2.getByRole('checkbox', { name: 'CounselorA User' })).toBeChecked();
    await client2.getByRole('checkbox', { name: 'CounselorB User' }).check();
    await content(client2).fill('Synthetic stale draft');
    await client.getByRole('checkbox', { name: 'CounselorA User' }).uncheck();
    await save(client, id);
    await client2.getByRole('button', { name: 'Save changes' }).click();
    await expect(client2.getByText(/Sharing changed elsewhere/)).toBeVisible();
    await expect(content(client2)).toHaveValue('Synthetic stale draft');
    await expect(client2.getByRole('checkbox', { name: 'CounselorB User' })).toBeChecked();
    await client2.getByRole('button', { name: 'Reload sharing and eligible counselors' }).click();
    await expect(client2.getByText('Current recipients: None.')).toBeVisible();
    await client2.getByRole('button', { name: 'Use current recipients and review' }).click();
    await client2.getByRole('checkbox', { name: 'CounselorA User' }).check();
    await save(client2, id);
    await expect(client2.getByText('Synthetic stale draft')).toBeVisible();
    console.log('PASS stale sharing conflict, preserved draft and reviewed retry');

    step = 'pagination and private isolation';
    for (let index = 0; index < 21; index++) {
      const current = (await api(client, `/diaries/${id}/shares`)).body;
      const rel = current.recipients[0].relationshipId;
      const result = await api(client, '/diaries', { method: 'POST', body: { entryType: 'FREE_JOURNAL', visibility: 'COUNSELOR', content: { text: `Synthetic page ${index}` }, recipientRelationshipIds: [rel] } });
      expect(result.status).toBe(201);
    }
    const privateResult = await api(client, '/diaries', { method: 'POST', body: { entryType: 'FREE_JOURNAL', visibility: 'PRIVATE', content: { text: 'Synthetic private control' } } });
    expect(privateResult.status).toBe(201);
    expect((await api(counselorA, `/counselor/diaries/${privateResult.body.id}`)).status).toBe(404);
    await list(counselorA);
    await expect(counselorA.getByRole('button', { name: 'Load more' })).toBeVisible();
    await counselorA.getByRole('button', { name: 'Load more' }).click();
    await expect(counselorA.getByText('You’ve reached the end.')).toBeVisible();
    for (let index = 0; index < 21; index++) await expect(counselorA.getByText(`Synthetic page ${index}`, { exact: true })).toBeVisible();
    await expect(counselorA.getByText('Synthetic private control')).toHaveCount(0);
    console.log('PASS pagination and private control');

    step = 'refresh rotation and logout';
    const oldRefresh = await client.evaluate(() => JSON.parse(sessionStorage.getItem('thought-diary.auth-session')).refreshToken);
    await client.evaluate(() => { const key = 'thought-diary.auth-session'; const session = JSON.parse(sessionStorage.getItem(key)); session.accessToken = 'invalid-test-token'; sessionStorage.setItem(key, JSON.stringify(session)); });
    step = 'refresh rotation: observe refresh request';
    const refreshResponse = client.waitForResponse((response) => response.url().endsWith('/auth/refresh') && response.request().method() === 'POST');
    await client.reload();
    step = 'refresh rotation: await refresh response';
    expect((await refreshResponse).status()).toBe(200);
    step = 'refresh rotation: verify dashboard';
    await client.goto(`${origin}/dashboard`);
    await expect(client.getByRole('heading', { name: 'Welcome back, Synthetic.' })).toBeVisible();
    const newRefresh = await client.evaluate(() => JSON.parse(sessionStorage.getItem('thought-diary.auth-session')).refreshToken);
    expect(newRefresh).not.toBe(oldRefresh);
    step = 'logout: click sign out';
    await client.getByRole('button', { name: 'Sign out' }).click();
    step = 'logout: await login';
    await client.waitForURL(/\/login/);
    expect(await client.evaluate(() => sessionStorage.getItem('thought-diary.auth-session'))).toBeNull();
    console.log('PASS browser refresh-token rotation and logout');
  } catch {
    console.error(`Sharing scenario failed: ${step}.`);
    throw new Error(`Sharing scenario failed: ${step}`);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
}
