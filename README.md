## Cloudflare Analytics
This repository contains a Cloudflare Analytics project inspired by [microlinkhq/analytics](https://github.com/microlinkhq/analytics). The goal of this project is to fetch and display Cloudflare HTTP request analytics for a specific zone, including daily, monthly, and quarterly breakdowns.

### Features
1. Retrieve and display HTTP request analytics from Cloudflare's GraphQL API
2. Break down analytics by day, month, and quarter
3. Cache analytics data to improve performance
4. Implemented using TypeScript and Express

## Usage
1. Clone the repository:
 ```git clone https://github.com/Georgee1337/cloudflare-analytics.git```

2. Install the required dependencies:
 ```yarn install```

3. Set up environment variables:
    ```ZONE_ID=your_zone_id
    X_AUTH_EMAIL=your_auth_email
    X_AUTH_KEY=your_auth_key
    HISTORY_MONTHS=3
    MAX_CACHE=86400
    ```

    Replace `your_zone_id`, `your_auth_email`, and `your_auth_key` with your actual Cloudflare credentials.

The server will start listening on the specified port (default is 3000). You can then access the analytics data by sending an HTTP request to the server.

## Updates
- Reduced data transfer and improved efficiency by removing unnecessary filters.
- Replaced multiple .reduce() calls with a single pass for faster computations.
- Implemented in-memory caching to reduce redundant API calls.
- Used Map instead of objects for better lookup efficiency.
- Simplified date manipulation with getPeriodKey() to remove unnecessary functions.
- Avoided deep object copies to optimize memory usage.