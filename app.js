const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const port = 3000;

// Create server and attach Socket.IO
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(__dirname + '/public'));

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/users', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log('Connected to MongoDB');
}).catch((error) => {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1); // Exit the application if DB connection fails
});

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

const User = mongoose.model('User', userSchema);

// Volunteer Schema
const volunteerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    city: { type: String, required: true },
    postal: { type: String, required: true },
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    time: { type: [String], required: true },
    roles: { type: [String], required: true }
});

const Volunteer = mongoose.model('Volunteer', volunteerSchema);

// Resource Schema
const resourceSchema = new mongoose.Schema({
    category: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    quantity: { type: Number, required: true },
    location: { type: String, required: true },
    price: { type: Number, default: 0 },
});

const Resource = mongoose.model('Resource', resourceSchema);

// Sign Up Route
app.post('/signup', async (req, res) => {
    const { username, email, password } = req.body;

    let errors = [];

    // Check required fields
    if (!username || !email || !password) {
        errors.push({ msg: 'Please fill in all fields' });
    }

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    } else {
        try {
            // Check if user already exists by email or username
            let existingUser = await User.findOne({ email });

            if (existingUser) {
                return res.status(400).json({ errors: [{ msg: 'Email already registered' }] });
            }

            let userWithSameUsername = await User.findOne({ username });
            if (userWithSameUsername) {
                return res.status(400).json({ errors: [{ msg: 'Username already taken' }] });
            }

            const newUser = new User({
                username,
                email,
                password
            });

            // Hash password
            const salt = await bcrypt.genSalt(10);
            newUser.password = await bcrypt.hash(password, salt);

            // Save user to database
            await newUser.save();

            res.status(200).json({ message: 'User registered successfully' });
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Server Error');
        }
    }
});

// Login Route
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Please provide username and password' });
    }

    try {
        // Check if the user exists
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        // Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        // Successful login
        res.status(200).json({ message: 'Login successful' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// Volunteer Sign-Up Route
app.post('/submit_volunteer', async (req, res) => {
    const { name, email, phone, city, postal, start_date, end_date, time, roles } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !city || !postal || !start_date || !end_date || !time.length || !roles.length) {
        return res.status(400).json({ message: 'Please fill in all required fields' });
    }

    try {
        // Create new volunteer document
        const newVolunteer = new Volunteer({
            name,
            email,
            phone,
            city,
            postal,
            start_date: new Date(start_date),
            end_date: new Date(end_date),
            time,
            roles
        });

        // Save volunteer to MongoDB
        await newVolunteer.save();

        // Broadcast the new volunteer data to all connected clients via WebSockets
        io.emit('newVolunteer', newVolunteer);

        // Respond with success message
        res.status(200).json({ message: 'Volunteer signed up successfully' });
    } catch (err) {
        console.error('Error saving volunteer:', err);
        res.status(500).json({ message: 'Server error. Please try again later.' });
    }
});

// Add Resource Route
app.post('/resources', async (req, res) => {
    const { category, name, description, quantity, location, price } = req.body;

    // Validate required fields
    if (!category || !name || !quantity || !location) {
        return res.status(400).json({ message: 'Please fill in all required fields' });
    }

    try {
        // Create new resource document
        const newResource = new Resource({
            category,
            name,
            description,
            quantity,
            location,
            price: price || 0,
        });

        // Save resource to MongoDB
        await newResource.save();

        // Respond with success message
        res.status(200).json({ message: 'Resource added successfully' });
    } catch (err) {
        console.error('Error adding resource:', err);
        res.status(500).json({ message: 'Server error. Please try again later.', error: err.message });
    }
});

// Route to fetch all volunteers
app.get('/volunteers', async (req, res) => {
    try {
        const volunteers = await Volunteer.find({});
        res.json(volunteers);
    } catch (err) {
        console.error('Error fetching volunteers:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Route to fetch all resources
app.get('/resources', async (req, res) => {
    try {
        const resources = await Resource.find({});
        res.json(resources);
    } catch (err) {
        console.error('Error fetching resources:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Request Resource Route
app.post('/request-resource', async (req, res) => {
    const { resourceId, quantity, fromDate, toDate } = req.body;

    try {
        const resource = await Resource.findById(resourceId);
        
        if (!resource) {
            return res.status(404).json({ message: 'Resource not found' });
        }

        // Check if the requested quantity is available
        if (quantity > resource.quantity) {
            return res.status(400).json({ message: 'Requested quantity exceeds available quantity' });
        }

        // Update resource quantity
        resource.quantity -= quantity;

        // Store the requested dates if applicable
        if (resource.category.toLowerCase() === 'shelter') {
            resource.start_date = new Date(fromDate);
            resource.end_date = new Date(toDate);
        }

        await resource.save();

        // Respond with updated resource data
        res.status(200).json({ message: 'Resource requested successfully', updatedResource: resource });
        
        // Optionally, emit an event for the updated resource
        io.emit('resourceUpdated', resource);

    } catch (err) {
        console.error('Error requesting resource:', err);
        res.status(500).json({ message: 'Server error. Please try again later.' });
    }
});

// Real-time connection with Socket.IO
io.on('connection', (socket) => {
    console.log('New client connected');
    
    // Listen for any specific events from client if needed
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Start the server
server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
