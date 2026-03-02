# AI/ML & LLM Integration — Comprehensive Knowledge Base

## 1. LLM Integration Patterns

### OpenAI-Compatible Chat API
```python
import httpx, json

async def chat_completion(messages, model="gpt-4", temperature=0.7, stream=True):
    """Works with OpenAI, Ollama, Anthropic (via proxy), DeepSeek, Qwen, etc."""
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            f"{BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "stream": stream,
                "max_tokens": 4096,
            },
        )
        
        if stream:
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    chunk = json.loads(data)
                    content = chunk["choices"][0]["delta"].get("content", "")
                    if content:
                        yield content
        else:
            result = response.json()
            yield result["choices"][0]["message"]["content"]
```

### Streaming SSE (Server-Sent Events)
```python
# FastAPI SSE endpoint
from fastapi.responses import StreamingResponse

@app.post("/api/chat")
async def chat(request: ChatRequest):
    async def generate():
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": request.message}
        ]
        async for chunk in chat_completion(messages):
            yield f"data: {json.dumps({'content': chunk})}\n\n"
        yield "data: [DONE]\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")
```

**SSE Critical Gotchas:**
- Buffer partial JSON across TCP chunks (chunks may split mid-JSON)
- Handle `[DONE]` sentinel token
- Guard against undefined content on abort: `content ?? ''`
- Clean up intervals/readers on component unmount
- Use `AbortController` for client-side cancellation
- Set `Cache-Control: no-cache` header

### Client-Side SSE Consumption
```typescript
async function* streamChat(message: string, signal?: AbortSignal) {
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
        signal,
    });
    
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') return;
                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.delta?.content 
                                 ?? parsed.content 
                                 ?? '';
                    if (content) yield content;
                } catch {
                    // Partial JSON, skip
                }
            }
        }
    }
}
```

## 2. Dual-Model Routing

### Architecture
```typescript
interface ModelRouter {
    reasoning: string;      // GPT-4, DeepSeek-R1 — for complex planning
    implementation: string; // GPT-3.5, Qwen3-Coder — for fast code gen
}

function selectModel(task: Task): string {
    // Score task complexity (0-1)
    const complexity = assessComplexity(task);
    
    if (complexity > 0.7) return 'reasoning';     // Architecture, debugging, planning
    if (complexity < 0.3) return 'implementation'; // Simple code, translations
    
    // Middle ground: check specific indicators
    if (task.requiresMultiStep) return 'reasoning';
    if (task.isBoilerplate) return 'implementation';
    
    return 'reasoning'; // Default to smarter model
}
```

### Complexity Assessment
```typescript
function assessComplexity(task: string): number {
    let score = 0.5;
    
    // Increase complexity
    if (/architect|design|plan|debug|refactor/i.test(task)) score += 0.2;
    if (/multiple files|cross-cutting|integration/i.test(task)) score += 0.15;
    if (/security|performance|scalability/i.test(task)) score += 0.1;
    
    // Decrease complexity
    if (/add field|rename|simple|boilerplate/i.test(task)) score -= 0.2;
    if (/typo|import|style|format/i.test(task)) score -= 0.15;
    
    return Math.max(0, Math.min(1, score));
}
```

## 3. AI Feature Factory (Pipeline)

### Seven-Stage Pipeline
```
1. UNDERSTAND   → Parse user request, identify intent and scope
2. PLAN         → Break into tasks, identify files to modify
3. IMPLEMENT    → Generate code changes
4. REVIEW       → Self-review for bugs, style, security
5. TEST         → Generate and run tests
6. INTEGRATE    → Merge changes, resolve conflicts
7. DEPLOY       → Build, deploy, verify
```

### Pipeline State Machine
```typescript
interface PipelineStage {
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    progress: number;  // 0-100
    output?: string;
    startedAt?: Date;
    completedAt?: Date;
}

function advancePipeline(stages: PipelineStage[], currentIndex: number) {
    if (stages[currentIndex].status === 'failed') {
        // Mark remaining stages as 'skipped', not 'failed'
        for (let i = currentIndex + 1; i < stages.length; i++) {
            stages[i].status = 'skipped';
        }
    }
}
```

## 4. Self-Learning System

### Pattern Memory
```typescript
interface LearningPattern {
    id: string;
    pattern: string;        // What was learned
    category: string;       // bug-fix, optimization, architecture, etc.
    confidence: number;     // 0-1
    usageCount: number;
    lastUsed: Date;
    source: string;         // Which project/session
}

// Update pattern on use
function updatePattern(pattern: LearningPattern, success: boolean) {
    pattern.usageCount++;
    pattern.lastUsed = new Date();
    // Exponential moving average for confidence
    const alpha = 0.3;
    pattern.confidence = alpha * (success ? 1 : 0) + (1 - alpha) * pattern.confidence;
}
```

### Context Builder
```typescript
interface ContextWindow {
    maxTokens: number;      // e.g., 128000 for GPT-4
    currentTokens: number;
    sections: ContextSection[];
}

interface ContextSection {
    type: 'system' | 'history' | 'code' | 'docs' | 'memory';
    content: string;
    priority: number;       // Higher = kept when truncating
    tokens: number;
}

// Prioritized context assembly
function buildContext(sections: ContextSection[], maxTokens: number): string {
    const sorted = [...sections].sort((a, b) => b.priority - a.priority);
    let totalTokens = 0;
    const included: string[] = [];
    
    for (const section of sorted) {
        if (totalTokens + section.tokens <= maxTokens) {
            included.push(section.content);
            totalTokens += section.tokens;
        }
    }
    
    return included.join('\n\n');
}
```

### Token Counting
```typescript
function estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters for English
    // More accurate: use tiktoken library
    return Math.ceil(text.length / 4);
}
```

## 5. Intent Classification

### Rule-Based (Fast Path)
```typescript
const INTENT_RULES = [
    // Code generation
    { pattern: /^(create|build|implement|add|make)\s/i, intent: 'generate', confidence: 0.85 },
    { pattern: /^(fix|debug|solve|resolve)\s/i, intent: 'fix_bug', confidence: 0.9 },
    { pattern: /^(refactor|improve|optimize|clean)\s/i, intent: 'refactor', confidence: 0.85 },
    { pattern: /^(explain|what|how|why)\s/i, intent: 'explain', confidence: 0.8 },
    { pattern: /^(test|write test|add test)\s/i, intent: 'test', confidence: 0.9 },
    { pattern: /^(deploy|publish|release)\s/i, intent: 'deploy', confidence: 0.85 },
    
    // Business intents
    { pattern: /create (invoice|order|quote)/i, intent: 'create_transaction', confidence: 0.9 },
    { pattern: /show (dashboard|metrics|analytics|report)/i, intent: 'view_analytics', confidence: 0.85 },
    { pattern: /add (customer|client|contact)/i, intent: 'create_entity', confidence: 0.85 },
];

function classifyIntent(message: string): { intent: string; confidence: number } {
    for (const rule of INTENT_RULES) {
        if (rule.pattern.test(message)) {
            return { intent: rule.intent, confidence: rule.confidence };
        }
    }
    return { intent: 'general', confidence: 0.5 };
}
```

### AI-Based (Fallback)
```typescript
async function aiClassifyIntent(message: string): Promise<{ intent: string; confidence: number }> {
    const response = await fetch('/api/ai/classify', {
        method: 'POST',
        body: JSON.stringify({
            messages: [{
                role: 'system',
                content: `Classify the user's intent into one of: generate, fix_bug, refactor, explain, test, deploy, create_transaction, view_analytics, create_entity, general. Respond with JSON: {"intent": "...", "confidence": 0.0-1.0}`
            }, {
                role: 'user',
                content: message
            }]
        })
    });
    return response.json();
}
```

## 6. Cloudflare Workers AI

### Edge AI Inference
```typescript
// Text generation
const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: userMessage },
    ],
    max_tokens: 1024,
    temperature: 0.7,
});

// Emotion/sentiment classification
const emotion = await env.AI.run(
    '@cf/huggingface/distilbert-base-uncased-emotion',
    { text: userMessage }
);
// Returns: { label: 'joy', score: 0.95 }

// Text embeddings
const embeddings = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: ['Hello world', 'Goodbye world'],
});

// Speech-to-text (Whisper)
const transcription = await env.AI.run('@cf/openai/whisper', {
    audio: audioData,
});
```

### Vectorize (Vector Search)
```typescript
// Store embeddings
await env.VECTORIZE.upsert([
    { id: 'doc-1', values: embedding, metadata: { title: 'My Document' } },
]);

// Query similar
const results = await env.VECTORIZE.query(queryEmbedding, {
    topK: 10,
    returnMetadata: true,
});
```

## 7. Prompt Engineering

### System Prompts
```
You are Pablo, an AI-powered IDE assistant. You help developers build features efficiently.

Rules:
1. Write clean, production-ready code
2. Follow existing code conventions
3. Include error handling and edge cases
4. Explain your reasoning briefly
5. If unsure, ask for clarification rather than guessing

Context: You have access to the user's codebase, git history, and documentation.
```

### Few-Shot Pattern
```
System: You are a code reviewer. For each code snippet, provide:
1. A severity rating (critical/warning/info)
2. A brief explanation
3. A suggested fix

Example:
Code: `eval(userInput)`
Rating: critical
Explanation: eval() executes arbitrary code, enabling code injection attacks
Fix: Use JSON.parse() for data, or a safe expression evaluator

Now review:
Code: {user_code}
```

### Chain-of-Thought
```
Think step by step:
1. First, analyze the error message
2. Identify the root cause
3. Consider possible fixes
4. Choose the minimal fix that resolves the issue
5. Verify the fix doesn't introduce new issues
```

## 8. RAG (Retrieval-Augmented Generation)

### Document Processing Pipeline
```
1. Ingest: PDF/DOCX/HTML → plain text
2. Chunk: Split into overlapping chunks (512 tokens, 50 token overlap)
3. Embed: Generate vector embeddings (bge-base-en, text-embedding-ada-002)
4. Store: Save in vector database (Vectorize, Pinecone, ChromaDB)
5. Query: User question → embed → similarity search → top-K chunks → LLM
```

### Chunking Strategy
```python
def chunk_text(text: str, chunk_size: int = 512, overlap: int = 50) -> list[str]:
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = ' '.join(words[i:i + chunk_size])
        if chunk:
            chunks.append(chunk)
    return chunks
```

## 9. Computer Vision

### Object Detection (YOLO)
```python
from ultralytics import YOLO

model = YOLO('yolov8n.pt')  # nano model for speed
results = model(image)

for result in results:
    for box in result.boxes:
        cls = int(box.cls[0])
        conf = float(box.conf[0])
        x1, y1, x2, y2 = box.xyxy[0]
        label = model.names[cls]
```

### OCR (Optical Character Recognition)
```python
import pytesseract
from PIL import Image

text = pytesseract.image_to_string(Image.open('document.png'))

# For structured data extraction
data = pytesseract.image_to_data(Image.open('document.png'), output_type=pytesseract.Output.DICT)
```

### Image Classification
```python
# Cloudflare Workers AI
const result = await env.AI.run('@cf/microsoft/resnet-50', {
    image: imageData,
});
// Returns: [{ label: 'cat', score: 0.98 }, ...]
```

## 10. NLP Tasks

### Named Entity Recognition (NER)
```python
# Custom NER for business entities
patterns = {
    'MONEY': r'\$[\d,]+\.?\d*|R\s?[\d,]+\.?\d*',
    'DATE': r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}',
    'EMAIL': r'\b[\w.+-]+@[\w-]+\.[\w.-]+\b',
    'PHONE': r'\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}',
    'COMPANY': r'(?:Shoprite|Pick n Pay|Woolworths|Spar|Checkers)\b',
}
```

### Sentiment Analysis
```python
# Using Workers AI
result = await env.AI.run('@cf/huggingface/distilbert-sst-2-int8', {
    text: review
})
# Returns: { label: 'POSITIVE', score: 0.95 }
```

## 11. Recommendation Engines

### Collaborative Filtering
```python
# User-item matrix factorization
from sklearn.decomposition import NMF

model = NMF(n_components=50, init='random', random_state=42)
user_features = model.fit_transform(user_item_matrix)
item_features = model.components_

# Recommend for user
scores = user_features[user_id] @ item_features
top_items = scores.argsort()[-10:][::-1]
```

### Content-Based Filtering
```python
# TF-IDF + cosine similarity
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

vectorizer = TfidfVectorizer(stop_words='english')
tfidf_matrix = vectorizer.fit_transform(item_descriptions)
similarities = cosine_similarity(tfidf_matrix)
```
