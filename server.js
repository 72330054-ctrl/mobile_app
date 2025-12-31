import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ------------------------
// Test route
app.get('/', (req, res) => {
  res.send('Backend is running');
});

// ------------------------
// Login or signup
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const { data: existingUser, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      return res.status(500).json({ error: selectError.message });
    }

    if (existingUser) {
      if (existingUser.password !== password) {
        return res.status(400).json({ error: 'Invalid password' });
      }
      return res.json({ message: 'Login successful', user: existingUser });
    }

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{ username, password }])
      .select()
      .single();

    if (insertError) return res.status(500).json({ error: insertError.message });

    res.json({ message: 'User created successfully', user: newUser });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------
// Get friends
app.get('/friends/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { data, error } = await supabase
      .from('friendships')
      .select(`
        id,
        user1_id,
        user2_id,
        users1:users!user1_id(id, username, profile_image),
        users2:users!user2_id(id, username, profile_image)
      `)
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

    if (error) return res.status(400).json({ error: error.message });

    const friends = data.map(f => {
      if (f.user1_id === userId) {
        return {
          friendship_id: f.id,
          id: f.users2.id,
          username: f.users2.username,
          profile_image: f.users2.profile_image
        };
      } else {
        return {
          friendship_id: f.id,
          id: f.users1.id,
          username: f.users1.username,
          profile_image: f.users1.profile_image
        };
      }
    });

    res.json({ friends });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------
// Get shared images
app.get('/shared-images/:friendshipId', async (req, res) => {
  const { friendshipId } = req.params;

  try {
    const { data, error } = await supabase
      .from('shared_images')
      .select(`
        id,
        friendship_id,
        sender_id,
        image_url,
        created_at
      `)
      .eq('friendship_id', friendshipId)
      .order('created_at', { ascending: true });

    if (error) return res.status(400).json({ error: error.message });

    res.json({ images: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------
// Add friend by code
app.post('/add-friend', async (req, res) => {
  const { senderId, friendCode } = req.body;

  try {
    const { data: receiver, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('friend_code', friendCode)
      .single();

    if (userError || !receiver) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (receiver.id === senderId) {
      return res.status(400).json({ error: 'You cannot add yourself' });
    }

    const { data: existingFriendship } = await supabase
      .from('friendships')
      .select('id')
      .or(
        `and(user1_id.eq.${senderId},user2_id.eq.${receiver.id}),
         and(user1_id.eq.${receiver.id},user2_id.eq.${senderId})`
      )
      .maybeSingle();

    if (existingFriendship) {
      return res.status(400).json({ error: 'Already friends' });
    }

    const { error: requestError } = await supabase
      .from('friend_requests')
      .insert({
        sender_id: senderId,
        receiver_id: receiver.id,
        status: 'pending',
      });

    if (requestError) return res.status(400).json({ error: requestError.message });

    res.json({ message: 'Friend request sent successfully' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------
// Get received requests
app.get('/requests/:id', async (req, res) => { 
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('receiver_id', id);

    if (error) return res.status(400).json({ error: error.message });

    res.json({ requests: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------
// Get sent requests
app.get('/sent-requests/:id', async (req, res) => { 
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('sender_id', id);

    if (error) return res.status(400).json({ error: error.message });

    res.json({ sentRequests: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------
// Accept friend request
app.post('/requests/:id/accept', async (req, res) => {
  const { id } = req.params;

  try {
    // 1️⃣ Update request status
    const { data: request, error } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted' })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // 2️⃣ Create friendship
    await supabase.from('friendships').insert({
      user1_id: request.sender_id,
      user2_id: request.receiver_id
    });

    res.json({ message: 'Friend request accepted', request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------
// Reject friend request
app.post('/requests/:id/reject', async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('friend_requests')
      .update({ status: 'rejected' })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: 'Friend request rejected', request: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------
// Start server
app.listen(process.env.PORT || 3000, () =>
  console.log(`Server running on port ${process.env.PORT || 3000}`)
);
