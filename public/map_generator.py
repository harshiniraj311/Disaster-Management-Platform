import requests
import folium
from pymongo import MongoClient
import re

# Constants
API_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventtype=EQ'
MONGO_URI = 'mongodb://localhost:27017/'
DB_NAME = 'disaster_events_db'
COLLECTION_NAME = 'events'

def fetch_data_from_api():
    response = requests.get(API_URL)
    return response.json()['features']

def store_data_in_mongo(data):
    # Connect to MongoDB
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]
    
    # Clear existing data
    collection.delete_many({})
    
    # Insert new data
    for event in data:
        properties = event['properties']
        geometry = event.get('geometry', {})
        coordinates = geometry.get('coordinates', [None, None])

        # Construct event data with non-null fields only
        event_data = {
            "event": properties.get('name'),
            "alert_level": properties.get('alertlevel'),
            "location": properties.get('country') or (properties.get('affectedcountries', [{}])[0].get('countryname') if properties.get('affectedcountries') else None),
            "latitude": coordinates[1] if len(coordinates) > 1 else None,
            "longitude": coordinates[0] if len(coordinates) > 0 else None,
            "report": properties.get("url", {}).get("report"),  # Get the report link
            "icon_url": properties.get("icon")  # Get the icon URL
        }

        # Extract date information from HTML description
        htmldescription = properties.get('htmldescription', '')
        date_range_pattern = re.search(r'from:\s*(\d{2} \w{3} \d{4})(?:\s*\d{2})?\s*to:\s*(\d{2} \w{3} \d{4})(?:\s*\d{2})?', htmldescription)
        single_date_pattern = re.search(r'at:\s*(\d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2}|\d{2} \w{3} \d{4} \d{2})', htmldescription)
        
        if date_range_pattern:
            event_data["from_date"] = date_range_pattern.group(1)
            event_data["to_date"] = date_range_pattern.group(2)
        elif single_date_pattern:
            event_data["date"] = single_date_pattern.group(1)
        
        # Filter out None values
        event_data = {k: v for k, v in event_data.items() if v is not None}
        
        # Insert event data into MongoDB
        collection.insert_one(event_data)

def fetch_events_from_mongo():
    # Connect to MongoDB
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]
    
    # Fetch all event documents
    return list(collection.find())

def create_map(events):
    # Center the map around a central point
    disaster_map = folium.Map(location=[0, 0], zoom_start=2)
    
    for event in events:
        title = event.get("event", "Unknown Event")
        location = event.get("location", "Unknown Location")
        latitude = event.get("latitude")
        longitude = event.get("longitude")
        alert_level = event.get("alert_level", "N/A")
        date = event.get("date", f"{event.get('from_date', '')} - {event.get('to_date', '')}")
        report_link = event.get("report", "No report link available")
        icon_url = event.get("icon_url", None)  # Fetch the custom icon URL

        if latitude is not None and longitude is not None:
            # Create a popup message with event details
            popup_message = (
                f"<b>Event:</b> {title}<br>"
                f"<b>Location:</b> {location}<br>"
                f"<b>Alert Level:</b> {alert_level}<br>"
                f"<b>Date:</b> {date}<br>"
                f"<b>Report:</b> <a href='{report_link}' target='_blank'>View Report</a>"
            )
            
            # Define a custom icon if icon URL is available
            if icon_url:
                icon = folium.CustomIcon(icon_url, icon_size=(20,20))  # Set size of the custom icon
            else:
                # Default icon color based on alert level if custom icon not available
                icon = folium.Icon(color="red" if alert_level == "Red" else "orange" if alert_level == "Orange" else "green")
            
            # Add a marker to the map with the custom icon
            folium.Marker(
                location=[latitude, longitude],
                popup=folium.Popup(popup_message, max_width=300),
                tooltip=title,
                icon=icon
            ).add_to(disaster_map)
    
    return disaster_map

def main():
    # Step 1: Fetch data from the API
    data = fetch_data_from_api()
    
    # Step 2: Store data in MongoDB
    store_data_in_mongo(data)
    
    # Step 3: Fetch updated data from MongoDB
    events = fetch_events_from_mongo()
    
    # Step 4: Create a map with the events
    disaster_map = create_map(events)
    
    # Save the map to an HTML file
    disaster_map.save("disaster_events_map.html")
    print("Map has been saved to disaster_events_map.html")

if __name__ == "__main__":
    main()
