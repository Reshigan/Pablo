# Testing Patterns — Comprehensive Knowledge Base

## 1. Unit Testing

### JavaScript/TypeScript (Vitest)
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('OrderService', () => {
    let service: OrderService;
    
    beforeEach(() => {
        service = new OrderService(mockDb);
    });
    
    it('calculates total with tax', () => {
        const items = [
            { name: 'Widget', price: 100, quantity: 2 },
            { name: 'Gadget', price: 50, quantity: 1 },
        ];
        const total = service.calculateTotal(items, 0.15); // 15% VAT
        expect(total).toBe(287.50); // (200 + 50) * 1.15
    });
    
    it('throws on empty order', () => {
        expect(() => service.calculateTotal([], 0.15)).toThrow('Order must have items');
    });
    
    it('applies discount correctly', () => {
        const result = service.applyDiscount(1000, 10); // 10% discount
        expect(result).toBe(900);
    });
});
```

### Python (pytest)
```python
import pytest
from app.services.order import OrderService

class TestOrderService:
    @pytest.fixture
    def service(self):
        return OrderService(db=MockDB())
    
    def test_calculate_total_with_vat(self, service):
        items = [{"price": 100, "qty": 2}, {"price": 50, "qty": 1}]
        assert service.calculate_total(items, vat_rate=0.15) == 287.50
    
    def test_empty_order_raises(self, service):
        with pytest.raises(ValueError, match="Order must have items"):
            service.calculate_total([], vat_rate=0.15)
    
    @pytest.mark.parametrize("amount,discount,expected", [
        (1000, 10, 900),
        (500, 0, 500),
        (200, 50, 100),
    ])
    def test_discount_calculation(self, service, amount, discount, expected):
        assert service.apply_discount(amount, discount) == expected
```

### React Component Testing
```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

describe('LoginForm', () => {
    it('submits credentials', async () => {
        const onSubmit = vi.fn();
        render(<LoginForm onSubmit={onSubmit} />);
        
        await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
        await userEvent.type(screen.getByLabelText(/password/i), 'password123');
        await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
        
        expect(onSubmit).toHaveBeenCalledWith({
            email: 'test@example.com',
            password: 'password123',
        });
    });
    
    it('shows validation errors', async () => {
        render(<LoginForm onSubmit={vi.fn()} />);
        
        await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
        
        expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    });
});
```

## 2. Integration Testing

### API Integration Tests
```python
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

class TestCustomerAPI:
    def test_create_customer(self, auth_headers):
        response = client.post("/api/customers", 
            json={"name": "Test Corp", "email": "test@corp.com"},
            headers=auth_headers)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Corp"
        assert "id" in data
    
    def test_list_customers_paginated(self, auth_headers):
        response = client.get("/api/customers?page=1&limit=10", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert "pages" in data
    
    def test_unauthorized_access(self):
        response = client.get("/api/customers")
        assert response.status_code == 401
    
    def test_cross_tenant_isolation(self, auth_headers_tenant_a, auth_headers_tenant_b):
        # Create customer in tenant A
        resp_a = client.post("/api/customers", 
            json={"name": "Tenant A Corp"}, headers=auth_headers_tenant_a)
        customer_id = resp_a.json()["id"]
        
        # Tenant B cannot access it
        resp_b = client.get(f"/api/customers/{customer_id}", headers=auth_headers_tenant_b)
        assert resp_b.status_code == 404
```

### Database Integration Tests
```python
@pytest.fixture
def test_db():
    """Create a fresh in-memory database for each test"""
    db = sqlite3.connect(":memory:")
    run_migrations(db)
    seed_test_data(db)
    yield db
    db.close()
```

## 3. End-to-End Testing

### Playwright
```typescript
import { test, expect } from '@playwright/test';

test.describe('Order Flow', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
        await page.fill('[name="email"]', 'admin@example.com');
        await page.fill('[name="password"]', 'password');
        await page.click('button[type="submit"]');
        await page.waitForURL('/dashboard');
    });
    
    test('create and submit order', async ({ page }) => {
        // Navigate to orders
        await page.click('text=Orders');
        await page.click('text=New Order');
        
        // Fill order details
        await page.selectOption('[name="customer"]', 'customer-1');
        await page.click('text=Add Item');
        await page.selectOption('[name="product"]', 'product-1');
        await page.fill('[name="quantity"]', '5');
        
        // Verify total
        await expect(page.locator('.order-total')).toContainText('R575.00');
        
        // Submit
        await page.click('text=Submit Order');
        await expect(page.locator('.toast-success')).toContainText('Order created');
        
        // Verify in list
        await page.click('text=Orders');
        await expect(page.locator('table')).toContainText('ORD-');
    });
    
    test('search and filter', async ({ page }) => {
        await page.goto('/customers');
        await page.fill('[placeholder="Search"]', 'Shoprite');
        await expect(page.locator('table tbody tr')).toHaveCount(1);
        await expect(page.locator('table')).toContainText('Shoprite');
    });
});
```

### Playwright Configuration
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
    },
});
```

## 4. API Testing with curl

### Common Test Patterns
```bash
# Health check
curl -s http://localhost:8000/health | jq

# Login and get token
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@test.com", "password": "password"}' | jq -r '.token')

# CRUD operations
# Create
curl -s -X POST http://localhost:8000/api/customers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Corp", "email": "test@corp.com"}' | jq

# Read (list)
curl -s "http://localhost:8000/api/customers?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq

# Read (single)
curl -s http://localhost:8000/api/customers/$ID \
  -H "Authorization: Bearer $TOKEN" | jq

# Update
curl -s -X PUT http://localhost:8000/api/customers/$ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Corp"}' | jq

# Delete
curl -s -X DELETE http://localhost:8000/api/customers/$ID \
  -H "Authorization: Bearer $TOKEN" | jq

# File upload
curl -s -X POST http://localhost:8000/api/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@document.pdf" | jq
```

## 5. Load Testing

### k6 Script
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    stages: [
        { duration: '30s', target: 20 },   // Ramp up
        { duration: '1m', target: 20 },     // Steady state
        { duration: '10s', target: 0 },     // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'],   // 95th percentile < 500ms
        http_req_failed: ['rate<0.01'],     // Error rate < 1%
    },
};

export default function() {
    const loginRes = http.post('https://api.example.com/auth/login', 
        JSON.stringify({ email: 'test@test.com', password: 'password' }),
        { headers: { 'Content-Type': 'application/json' } }
    );
    
    check(loginRes, { 'login status 200': (r) => r.status === 200 });
    
    const token = loginRes.json('token');
    const headers = { Authorization: `Bearer ${token}` };
    
    const customersRes = http.get('https://api.example.com/api/customers', { headers });
    check(customersRes, { 'customers status 200': (r) => r.status === 200 });
    
    sleep(1);
}
```

## 6. Test Data Management

### Factory Pattern
```typescript
class TestFactory {
    static createCustomer(overrides = {}) {
        return {
            id: `cust-${Date.now()}`,
            name: `Test Customer ${Math.random().toString(36).slice(2, 7)}`,
            email: `test-${Date.now()}@example.com`,
            phone: '+27 11 555 0100',
            company_id: 'test-company',
            ...overrides,
        };
    }
    
    static createOrder(customer, items = [], overrides = {}) {
        return {
            id: `ord-${Date.now()}`,
            customer_id: customer.id,
            company_id: customer.company_id,
            items: items.length ? items : [TestFactory.createOrderItem()],
            status: 'pending',
            ...overrides,
        };
    }
}
```

### Snapshot Testing
```typescript
it('renders dashboard correctly', () => {
    const { container } = render(<Dashboard data={mockData} />);
    expect(container).toMatchSnapshot();
});
```

## 7. CI Testing Pipeline

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run test -- --coverage
      - uses: codecov/codecov-action@v4

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```
