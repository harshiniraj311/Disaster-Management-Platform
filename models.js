const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/mydatabase', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const db = mongoose.connection;

db.on('error', (error) => {
    console.error('MongoDB connection error:', error);
});

db.once('open', () => {
    console.log('Connected to MongoDB');
});

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    password: { type: String, required: true }
});

// User Model
const User = mongoose.model('User', userSchema);

// Volunteer Schema
const volunteerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    postal: { type: String, required: true },
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    time: [String], // Array of strings for times of day available
    roles: [String] // Array of strings for preferred roles
});

// Volunteer Model
const Volunteer = mongoose.model('Volunteer', volunteerSchema);

module.exports = { User, Volunteer };
