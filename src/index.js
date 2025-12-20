/**
 * ADCS Worker - Contact Database and File Storage
 * Handles file uploads, contact management, and serves files
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle OPTIONS for CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Authentication routes (no auth required)
      if (path === '/api/auth/signup' && request.method === 'POST') {
        return await signup(request, env, corsHeaders);
      }
      
      if (path === '/api/auth/login' && request.method === 'POST') {
        return await login(request, env, corsHeaders);
      }
      
      if (path === '/api/auth/logout' && request.method === 'POST') {
        return await logout(request, env, corsHeaders);
      }
      
      if (path === '/api/auth/me' && request.method === 'GET') {
        return await getCurrentUser(request, env, corsHeaders);
      }

      // Get user from session for protected routes
      const user = await getUserFromSession(request, env);
      if (!user && !path.startsWith('/health')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Protected Routes
      if (path === '/api/contacts' && request.method === 'GET') {
        return await getContacts(user.id, env, corsHeaders);
      }
      
      if (path === '/api/contacts' && request.method === 'POST') {
        return await createContact(request, user.id, env, corsHeaders);
      }
      
      if (path.startsWith('/api/contacts/') && request.method === 'GET') {
        const contactId = path.split('/').pop();
        return await getContact(contactId, user.id, env, corsHeaders);
      }
      
      if (path.startsWith('/api/contacts/') && request.method === 'PUT') {
        const contactId = path.split('/').pop();
        return await updateContact(contactId, user.id, request, env, corsHeaders);
      }
      
      if (path.startsWith('/api/contacts/') && request.method === 'DELETE') {
        const contactId = path.split('/').pop();
        return await deleteContact(contactId, user.id, env, corsHeaders);
      }
      
      if (path === '/api/files/upload' && request.method === 'POST') {
        return await uploadFile(request, user.id, env, corsHeaders);
      }
      
      if (path.startsWith('/api/files/') && path !== '/api/files/upload' && request.method === 'GET') {
        const fileKey = decodeURIComponent(path.replace('/api/files/', ''));
        return await getFile(fileKey, user.id, env, corsHeaders);
      }
      
      if (path === '/api/files' && request.method === 'GET') {
        return await listFiles(user.id, env, corsHeaders);
      }

      // Health check
      if (path === '/health') {
        return new Response('OK', { headers: corsHeaders });
      }

      // Try to serve static assets using newer assets binding
      if (env.ASSETS) {
        try {
          const assetResponse = await env.ASSETS.fetch(request);
          if (assetResponse.status !== 404) {
            return assetResponse;
          }
        } catch (e) {
          console.error('Asset error:', e.message);
        }
      }
      
      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// Contact Management Functions

async function getContacts(userId, env, corsHeaders) {
  const stmt = env.D1_DATABASE.prepare('SELECT * FROM contacts WHERE user_id = ? ORDER BY id DESC');
  const result = await stmt.bind(userId).all();
  
  return new Response(JSON.stringify(result.results), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function createContact(request, userId, env, corsHeaders) {
  const data = await request.json();
  const { email, name, metadata } = data;
  
  const stmt = env.D1_DATABASE.prepare(
    'INSERT INTO contacts (email, name, last_contacted, metadata, user_id) VALUES (?, ?, ?, ?, ?)'
  );
  
  const result = await stmt.bind(
    email,
    name || '',
    new Date().toISOString(),
    metadata ? JSON.stringify(metadata) : '{}',
    userId
  ).run();
  
  return new Response(JSON.stringify({ id: result.meta.last_row_id }), {
    status: 201,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function getContact(contactId, userId, env, corsHeaders) {
  const stmt = env.D1_DATABASE.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?');
  const result = await stmt.bind(contactId, userId).first();
  
  if (!result) {
    return new Response('Contact not found', { status: 404, headers: corsHeaders });
  }
  
  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function updateContact(contactId, userId, request, env, corsHeaders) {
  const data = await request.json();
  const updates = [];
  const values = [];
  
  if (data.name !== undefined) {
    updates.push('name = ?');
    values.push(data.name);
  }
  if (data.email !== undefined) {
    updates.push('email = ?');
    values.push(data.email);
  }
  if (data.unsubscribed !== undefined) {
    updates.push('unsubscribed = ?');
    values.push(data.unsubscribed ? 1 : 0);
  }
  if (data.metadata !== undefined) {
    updates.push('metadata = ?');
    values.push(JSON.stringify(data.metadata));
  }
  
  values.push(contactId, userId);
  
  const stmt = env.D1_DATABASE.prepare(
    `UPDATE contacts SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
  );
  
  await stmt.bind(...values).run();
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function deleteContact(contactId, userId, env, corsHeaders) {
  const stmt = env.D1_DATABASE.prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?');
  await stmt.bind(contactId, userId).run();
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// File Management Functions

async function uploadFile(request, userId, env, corsHeaders) {
  const formData = await request.formData();
  const file = formData.get('file');
  const contactId = formData.get('contactId');
  
  if (!file) {
    return new Response('No file provided', { status: 400, headers: corsHeaders });
  }
  
  // Generate unique key for the file
  const fileKey = `${Date.now()}-${file.name}`;
  const fileBuffer = await file.arrayBuffer();
  
  // Upload to R2
  await env.R2_BUCKET.put(fileKey, fileBuffer, {
    httpMetadata: {
      contentType: file.type,
    }
  });
  
  // Store file metadata in D1
  const stmt = env.D1_DATABASE.prepare(
    'INSERT INTO files (key, name, mime, size, uploaded_at, user_id) VALUES (?, ?, ?, ?, ?, ?)'
  );
  
  const result = await stmt.bind(
    fileKey,
    file.name,
    file.type,
    file.size,
    new Date().toISOString(),
    userId
  ).run();
  
  const fileId = result.meta.last_row_id;
  
  // Link file to contact if provided
  if (contactId) {
    const linkStmt = env.D1_DATABASE.prepare(
      'INSERT INTO file_contacts (file_id, contact_id, is_original) VALUES (?, ?, 1)'
    );
    await linkStmt.bind(fileId, contactId).run();
  }
  
  // Store alias in KV
  await env.KV_NAMESPACE.put(fileKey, JSON.stringify({
    fileId,
    name: file.name,
    uploadedAt: new Date().toISOString()
  }));
  
  return new Response(JSON.stringify({ 
    success: true, 
    fileId,
    fileKey 
  }), {
    status: 201,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function getFile(fileKey, userId, env, corsHeaders) {
  // Verify user owns this file
  const fileCheck = await env.D1_DATABASE.prepare(
    'SELECT id FROM files WHERE key = ? AND user_id = ?'
  ).bind(fileKey, userId).first();
  
  if (!fileCheck) {
    return new Response('File not found or access denied', { status: 403, headers: corsHeaders });
  }
  
  try {
    // Get file from R2 directly
    const object = await env.R2_BUCKET.get(fileKey);
    
    if (!object) {
      return new Response(`File not found in storage: ${fileKey}`, { status: 404, headers: corsHeaders });
    }
    
    const headers = new Headers(corsHeaders);
    object.writeHttpMetadata(headers);
    headers.set('Content-Disposition', `attachment; filename="${fileKey.split('-').slice(1).join('-') || fileKey}"`);
    
    return new Response(object.body, { headers });
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500, headers: corsHeaders });
  }
}

async function listFiles(userId, env, corsHeaders) {
  const stmt = env.D1_DATABASE.prepare('SELECT * FROM files WHERE user_id = ? ORDER BY uploaded_at DESC');
  const result = await stmt.bind(userId).all();
  
  return new Response(JSON.stringify(result.results), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Authentication Functions

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSessionId() {
  return crypto.randomUUID();
}

async function signup(request, env, corsHeaders) {
  const { username, email, password } = await request.json();
  
  if (!username || !email || !password) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  const passwordHash = await hashPassword(password);
  
  try {
    const stmt = env.D1_DATABASE.prepare(
      'INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, ?)'
    );
    
    const result = await stmt.bind(
      username,
      email,
      passwordHash,
      new Date().toISOString()
    ).run();
    
    const userId = result.meta.last_row_id;
    
    // Create session
    const sessionId = generateSessionId();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    await env.D1_DATABASE.prepare(
      'INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(sessionId, userId, new Date().toISOString(), expiresAt.toISOString()).run();
    
    return new Response(JSON.stringify({ 
      success: true, 
      userId,
      sessionId,
      username,
      email
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return new Response(JSON.stringify({ error: 'Username or email already exists' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    throw error;
  }
}

async function login(request, env, corsHeaders) {
  const { email, password } = await request.json();
  
  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Missing email or password' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  const passwordHash = await hashPassword(password);
  
  const user = await env.D1_DATABASE.prepare(
    'SELECT * FROM users WHERE email = ? AND password_hash = ?'
  ).bind(email, passwordHash).first();
  
  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  // Update last login
  await env.D1_DATABASE.prepare(
    'UPDATE users SET last_login = ? WHERE id = ?'
  ).bind(new Date().toISOString(), user.id).run();
  
  // Create session
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  
  await env.D1_DATABASE.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(sessionId, user.id, new Date().toISOString(), expiresAt.toISOString()).run();
  
  return new Response(JSON.stringify({ 
    success: true,
    sessionId,
    userId: user.id,
    username: user.username,
    email: user.email
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function logout(request, env, corsHeaders) {
  const sessionId = request.headers.get('Authorization')?.replace('Bearer ', '');
  
  if (sessionId) {
    await env.D1_DATABASE.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
  }
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function getCurrentUser(request, env, corsHeaders) {
  const user = await getUserFromSession(request, env);
  
  if (!user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({ 
    id: user.id,
    username: user.username,
    email: user.email
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function getUserFromSession(request, env) {
  const sessionId = request.headers.get('Authorization')?.replace('Bearer ', '');
  
  if (!sessionId) {
    return null;
  }
  
  const session = await env.D1_DATABASE.prepare(
    'SELECT s.*, u.* FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.expires_at > ?'
  ).bind(sessionId, new Date().toISOString()).first();
  
  if (!session) {
    return null;
  }
  
  return {
    id: session.user_id,
    username: session.username,
    email: session.email
  };
}
