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

// Login (check users table)
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single(); // get one user
    if (error || !data) return res.status(400).json({ error: 'Invalid username or password' });
    res.json({ message: 'Login successful', user: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.listen(process.env.PORT || 3000, () => console.log(`Server running on port ${process.env.PORT || 3000}`));
