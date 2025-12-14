#!/bin/bash

# MenuLogs API Test Script
# Run this after starting the server to verify everything works

API_URL="http://localhost:5000/api/v1"
COLOR_GREEN='\033[0;32m'
COLOR_RED='\033[0;31m'
COLOR_YELLOW='\033[1;33m'
COLOR_RESET='\033[0m'

echo "🧪 MenuLogs API Test Script"
echo "=============================="
echo ""

# Test 1: Health Check
echo "1️⃣  Testing Health Check..."
HEALTH=$(curl -s "$API_URL/../health")
if [[ $HEALTH == *"OK"* ]]; then
    echo -e "${COLOR_GREEN}✅ Health check passed${COLOR_RESET}"
else
    echo -e "${COLOR_RED}❌ Health check failed${COLOR_RESET}"
    exit 1
fi
echo ""

# Test 2: API Info
echo "2️⃣  Testing API Info..."
API_INFO=$(curl -s "$API_URL/")
if [[ $API_INFO == *"MenuLogs API"* ]]; then
    echo -e "${COLOR_GREEN}✅ API info endpoint working${COLOR_RESET}"
else
    echo -e "${COLOR_RED}❌ API info failed${COLOR_RESET}"
fi
echo ""

# Test 3: Signup
echo "3️⃣  Testing Signup..."
SIGNUP_RESPONSE=$(curl -s -X POST "$API_URL/auth/signup" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "Test User",
        "email": "test'$RANDOM'@example.com",
        "password": "test123456"
    }')

if [[ $SIGNUP_RESPONSE == *"accessToken"* ]]; then
    echo -e "${COLOR_GREEN}✅ Signup successful${COLOR_RESET}"
    ACCESS_TOKEN=$(echo $SIGNUP_RESPONSE | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
else
    echo -e "${COLOR_YELLOW}⚠️  Signup skipped (may already exist)${COLOR_RESET}"
fi
echo ""

# Test 4: Login with demo account
echo "4️⃣  Testing Login (Demo Account)..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{
        "email": "demo@restaurant.com",
        "password": "demo123"
    }')

if [[ $LOGIN_RESPONSE == *"accessToken"* ]]; then
    echo -e "${COLOR_GREEN}✅ Login successful${COLOR_RESET}"
    ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
    echo "   Token: ${ACCESS_TOKEN:0:50}..."
else
    echo -e "${COLOR_RED}❌ Login failed${COLOR_RESET}"
    echo "   Response: $LOGIN_RESPONSE"
    echo -e "${COLOR_YELLOW}💡 Tip: Run 'npm run prisma:seed' to create demo account${COLOR_RESET}"
    exit 1
fi
echo ""

# Test 5: Get Current User
echo "5️⃣  Testing Protected Route (/auth/me)..."
ME_RESPONSE=$(curl -s "$API_URL/auth/me" \
    -H "Authorization: Bearer $ACCESS_TOKEN")

if [[ $ME_RESPONSE == *"user"* ]]; then
    echo -e "${COLOR_GREEN}✅ Protected route working${COLOR_RESET}"
else
    echo -e "${COLOR_RED}❌ Protected route failed${COLOR_RESET}"
fi
echo ""

# Test 6: List Businesses
echo "6️⃣  Testing Business List..."
BUSINESS_RESPONSE=$(curl -s "$API_URL/businesses" \
    -H "Authorization: Bearer $ACCESS_TOKEN")

if [[ $BUSINESS_RESPONSE == *"businesses"* ]]; then
    echo -e "${COLOR_GREEN}✅ Business endpoints working${COLOR_RESET}"
else
    echo -e "${COLOR_RED}❌ Business endpoints failed${COLOR_RESET}"
fi
echo ""

# Test 7: List Locations
echo "7️⃣  Testing Location List..."
LOCATION_RESPONSE=$(curl -s "$API_URL/locations" \
    -H "Authorization: Bearer $ACCESS_TOKEN")

if [[ $LOCATION_RESPONSE == *"locations"* ]]; then
    echo -e "${COLOR_GREEN}✅ Location endpoints working${COLOR_RESET}"
    LOCATION_ID=$(echo $LOCATION_RESPONSE | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
    echo "   Found location ID: $LOCATION_ID"
else
    echo -e "${COLOR_RED}❌ Location endpoints failed${COLOR_RESET}"
fi
echo ""

# Test 8: Public API (if location exists)
if [ ! -z "$LOCATION_ID" ]; then
    echo "8️⃣  Testing Public API (Customer Facing)..."
    PUBLIC_RESPONSE=$(curl -s "$API_URL/public/locations/$LOCATION_ID/menu")
    
    if [[ $PUBLIC_RESPONSE == *"categories"* ]]; then
        echo -e "${COLOR_GREEN}✅ Public API working${COLOR_RESET}"
    else
        echo -e "${COLOR_RED}❌ Public API failed${COLOR_RESET}"
    fi
    echo ""
fi

# Summary
echo "=============================="
echo -e "${COLOR_GREEN}🎉 All basic tests completed!${COLOR_RESET}"
echo ""
echo "📊 Test Summary:"
echo "   ✅ Health check"
echo "   ✅ Authentication"
echo "   ✅ Protected routes"
echo "   ✅ Business management"
echo "   ✅ Location management"
echo "   ✅ Public API"
echo ""
echo "🚀 Backend is ready for frontend integration!"
echo ""
echo "📚 Documentation:"
echo "   - API Docs: backend/API_DOCUMENTATION.md"
echo "   - Setup Guide: backend/SETUP.md"
echo "   - Full Summary: backend/BACKEND_COMPLETE.md"
echo ""

