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

// Test route
app.get('/', (req, res) => {
  res.send('Backend is running');
});

// Login or signup
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    // Check if user exists
    const { data: existingUser, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      // Unexpected error
      return res.status(500).json({ error: selectError.message });
    }

    if (existingUser) {
      // User exists, check password
      if (existingUser.password !== password) {
        return res.status(400).json({ error: 'Invalid password' });
      }
      return res.json({ message: 'Login successful', user: existingUser });
    }

    // User doesn't exist → create new user (signup)
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
// Get friends of a specific user
app.get('/friends/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Fetch friendships where the user is user1 or user2
    const { data, error } = await supabase
      .from('friendships')
      .select(`
        id,                     -- friendship id
        user1_id,
        user2_id,
        users1:users!user1_id(id, username, profile_image),
        users2:users!user2_id(id, username, profile_image)
      `)
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

    if (error) return res.status(400).json({ error: error.message });

    // Map to get the friend info (excluding self) and include friendship id
    const friends = data.map(f => {
      if (f.user1_id === userId) {
        return {
          friendship_id: f.id,       // friendship id
          id: f.users2.id,
          username: f.users2.username,
          profile_image: f.users2.profile_image
        };
      } else {
        return {
          friendship_id: f.id,       // friendship id
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



app.listen(process.env.PORT || 3000, () => console.log(`Server running on port ${process.env.PORT || 3000}`));
