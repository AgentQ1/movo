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
      
      // Public endpoint for viewing shared contacts (no auth required)
      if (path.startsWith('/api/shared/') && path.includes('/file/') && request.method === 'GET') {
        const parts = path.split('/');
        const shareToken = parts[3];
        const fileKey = decodeURIComponent(parts[5]);
        return await getSharedFile(shareToken, fileKey, env, corsHeaders);
      }
      
      if (path.startsWith('/api/shared/') && path.endsWith('/files') && request.method === 'GET') {
        const shareToken = path.split('/')[3];
        return await getSharedContactFiles(shareToken, env, corsHeaders);
      }
      
      if (path.startsWith('/api/shared/') && request.method === 'GET') {
        const shareToken = path.split('/').pop();
        return await getSharedContact(shareToken, env, corsHeaders);
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
      
      if (path.startsWith('/api/contacts/') && path.includes('/files') && request.method === 'GET') {
        const contactId = path.split('/')[3];
        return await getContactFiles(contactId, user.id, env, corsHeaders);
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
      
      if (path.startsWith('/api/contacts/') && path.endsWith('/share') && request.method === 'POST') {
        const contactId = path.split('/')[3];
        return await createShareLink(contactId, user.id, env, corsHeaders);
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
  
  try {
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
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return new Response(JSON.stringify({ error: 'A contact with this email already exists' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    throw error;
  }
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
  // Verify user owns this file OR has access through a contact they own
  const fileCheck = await env.D1_DATABASE.prepare(`
    SELECT f.id, f.name, f.mime FROM files f
    LEFT JOIN file_contacts fc ON f.id = fc.file_id
    LEFT JOIN contacts c ON fc.contact_id = c.id
    WHERE f.key = ? AND (f.user_id = ? OR c.user_id = ?)
    LIMIT 1
  `).bind(fileKey, userId, userId).first();
  
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
    
    // Use the actual filename from database instead of parsing the key
    const filename = fileCheck.name || fileKey.split('-').slice(1).join('-') || fileKey;
    headers.set('Content-Disposition', `inline; filename="${filename}"`);
    
    // Set content type for proper preview
    // Use mime from database if available, otherwise derive from filename extension
    if (fileCheck.mime) {
      headers.set('Content-Type', fileCheck.mime);
    } else if (filename) {
      const extension = filename.split('.').pop().toLowerCase();
      const contentTypeMap = {
        'pdf': 'application/pdf',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'm4a': 'audio/mp4',
        'aac': 'audio/aac',
        'eml': 'message/rfc822',
        'msg': 'application/vnd.ms-outlook'
      };
      const contentType = contentTypeMap[extension] || 'application/octet-stream';
      headers.set('Content-Type', contentType);
    }
    
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

async function getContactFiles(contactId, userId, env, corsHeaders) {
  // Verify contact belongs to user
  const contactCheck = await env.D1_DATABASE.prepare(
    'SELECT id FROM contacts WHERE id = ? AND user_id = ?'
  ).bind(contactId, userId).first();
  
  if (!contactCheck) {
    return new Response('Contact not found', { status: 404, headers: corsHeaders });
  }
  
  // Get files linked to this contact
  const stmt = env.D1_DATABASE.prepare(
    `SELECT f.* FROM files f 
     JOIN file_contacts fc ON f.id = fc.file_id 
     WHERE fc.contact_id = ? AND f.user_id = ?
     ORDER BY f.uploaded_at DESC`
  );
  
  const result = await stmt.bind(contactId, userId).all();
  
  return new Response(JSON.stringify(result.results || []), {
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
  
  // Check if user already exists by email
  const existingUser = await env.D1_DATABASE.prepare(
    'SELECT * FROM users WHERE email = ?'
  ).bind(email).first();
  
  if (existingUser) {
    // User exists, verify password
    const passwordHash = await hashPassword(password);
    
    if (existingUser.password_hash === passwordHash) {
      // Password matches, log them in
      const sessionId = generateSessionId();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      
      await env.D1_DATABASE.prepare(
        'INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
      ).bind(sessionId, existingUser.id, new Date().toISOString(), expiresAt.toISOString()).run();
      
      // Update last login
      await env.D1_DATABASE.prepare(
        'UPDATE users SET last_login = ? WHERE id = ?'
      ).bind(new Date().toISOString(), existingUser.id).run();
      
      return new Response(JSON.stringify({ 
        success: true, 
        userId: existingUser.id,
        sessionId,
        username: existingUser.username,
        email: existingUser.email,
        message: 'Welcome back! Logged in with existing account.'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      // Email exists but password is different
      return new Response(JSON.stringify({ error: 'Email already registered with a different password. Please login instead.' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
  
  // New user, proceed with signup
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
      return new Response(JSON.stringify({ error: 'Username already exists. Please choose a different username.' }), {
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

// Share functionality

function generateShareToken() {
  return crypto.randomUUID();
}

async function createShareLink(contactId, userId, env, corsHeaders) {
  // Verify contact belongs to user
  const contact = await env.D1_DATABASE.prepare(
    'SELECT * FROM contacts WHERE id = ? AND user_id = ?'
  ).bind(contactId, userId).first();
  
  if (!contact) {
    return new Response(JSON.stringify({ error: 'Contact not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  // Check if share already exists
  const existingShare = await env.D1_DATABASE.prepare(
    'SELECT share_token FROM shared_contacts WHERE contact_id = ? AND user_id = ?'
  ).bind(contactId, userId).first();
  
  if (existingShare) {
    return new Response(JSON.stringify({ 
      shareToken: existingShare.share_token,
      shareUrl: `/shared/${existingShare.share_token}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  // Create new share
  const shareToken = generateShareToken();
  
  // Get files associated with this contact
  const filesStmt = env.D1_DATABASE.prepare(
    `SELECT f.* FROM files f 
     JOIN file_contacts fc ON f.id = fc.file_id 
     WHERE fc.contact_id = ? AND f.user_id = ?
     ORDER BY f.uploaded_at DESC`
  );
  const filesResult = await filesStmt.bind(contactId, userId).all();
  
  const contactData = JSON.stringify({
    name: contact.name,
    email: contact.email,
    last_contacted: contact.last_contacted,
    metadata: contact.metadata,
    files: filesResult.results || []
  });
  
  await env.D1_DATABASE.prepare(
    'INSERT INTO shared_contacts (share_token, contact_id, user_id, contact_data, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(shareToken, contactId, userId, contactData, new Date().toISOString()).run();
  
  return new Response(JSON.stringify({ 
    shareToken,
    shareUrl: `/shared/${shareToken}`
  }), {
    status: 201,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function getSharedContact(shareToken, env, corsHeaders) {
  const sharedContact = await env.D1_DATABASE.prepare(
    'SELECT * FROM shared_contacts WHERE share_token = ?'
  ).bind(shareToken).first();
  
  if (!sharedContact) {
    return new Response(JSON.stringify({ error: 'Shared contact not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  // Increment view count
  await env.D1_DATABASE.prepare(
    'UPDATE shared_contacts SET views = views + 1 WHERE share_token = ?'
  ).bind(shareToken).run();
  
  const contactData = JSON.parse(sharedContact.contact_data);
  
  return new Response(JSON.stringify({
    ...contactData,
    sharedBy: sharedContact.user_id,
    sharedAt: sharedContact.created_at,
    views: sharedContact.views + 1
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function getSharedContactFiles(shareToken, env, corsHeaders) {
  const sharedContact = await env.D1_DATABASE.prepare(
    'SELECT * FROM shared_contacts WHERE share_token = ?'
  ).bind(shareToken).first();
  
  if (!sharedContact) {
    return new Response(JSON.stringify({ error: 'Shared contact not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  const contactData = JSON.parse(sharedContact.contact_data);
  const files = contactData.files || [];
  
  // For each file, get it from R2
  const filePromises = files.map(async (file) => {
    try {
      const object = await env.R2_BUCKET.get(file.key);
      if (object) {
        return {
          ...file,
          available: true
        };
      }
      return { ...file, available: false };
    } catch (error) {
      return { ...file, available: false };
    }
  });
  
  const filesWithAvailability = await Promise.all(filePromises);
  
  return new Response(JSON.stringify(filesWithAvailability), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function getSharedFile(shareToken, fileKey, env, corsHeaders) {
  // Verify the share token is valid
  const sharedContact = await env.D1_DATABASE.prepare(
    'SELECT * FROM shared_contacts WHERE share_token = ?'
  ).bind(shareToken).first();
  
  if (!sharedContact) {
    return new Response('Shared contact not found', { status: 404, headers: corsHeaders });
  }
  
  const contactData = JSON.parse(sharedContact.contact_data);
  const files = contactData.files || [];
  
  // Check if the file belongs to this shared contact
  const file = files.find(f => f.key === fileKey);
  if (!file) {
    return new Response('File not found in shared contact', { status: 404, headers: corsHeaders });
  }
  
  // Get file from R2
  try {
    const object = await env.R2_BUCKET.get(fileKey);
    
    if (!object) {
      return new Response('File not found in storage', { status: 404, headers: corsHeaders });
    }
    
    const headers = new Headers(corsHeaders);
    object.writeHttpMetadata(headers);
    headers.set('Content-Disposition', `attachment; filename="${file.name}"`);
    
    return new Response(object.body, { headers });
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500, headers: corsHeaders });
  }
}
