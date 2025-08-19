# 🤖 OpenAI Output Format Specification

## Required JSON Structure

GPT-4 MUST return ONLY a JSON object in this exact format:

```json
{
  "points": [
    {"x": -15.5, "y": 20.0},
    {"x": -18.2, "y": 15.7},
    {"x": -22.0, "y": 8.3},
    ...
    {"x": -15.5, "y": 20.0}
  ],
  "reasoning": "Simple cat silhouette with pointed ears and rounded body for easy cookie cutting",
  "category": "animal"
}
```

## Field Requirements

### `points` Array
- **Type**: Array of coordinate objects
- **Length**: 15-30 points (optimal for detail vs complexity)
- **Format**: Each point: `{"x": number, "y": number}`
- **Coordinates**: Between -50 and +50 (will be clamped if outside)
- **Closed Path**: First point MUST equal last point
- **Direction**: Clockwise tracing of outer edge
- **Smoothness**: Gradual transitions between points

### `reasoning` String
- **Type**: String (1-2 sentences)
- **Content**: Brief explanation of design choices
- **Examples**: 
  - "Simple cat silhouette with pointed ears for easy recognition"
  - "Streamlined rocket design with fins for stability and clear identification"

### `category` String
- **Type**: String (one of predefined options)
- **Valid Values**:
  - `"animal"` - cats, dogs, birds, fish, etc.
  - `"nature"` - leaves, flowers, trees, mountains, etc.
  - `"object"` - cars, houses, tools, etc.
  - `"food"` - fruits, vegetables, treats, etc.
  - `"holiday"` - Christmas, Halloween, Easter themes, etc.
  - `"abstract"` - geometric patterns, symbols, etc.
  - `"vehicle"` - cars, planes, ships, rockets, etc.
  - `"character"` - people, fantasy creatures, etc.

## Validation Rules

### Automatic Corrections Applied:
1. **Point Count**: If >50 points, truncated to 50
2. **Coordinate Bounds**: Values >50 or <-50 are clamped
3. **Path Closure**: If first ≠ last point, first point is duplicated as last
4. **Category**: Invalid categories default to "abstract"

### Error Conditions:
- **Missing Fields**: Any required field missing
- **Invalid Points**: Non-numeric coordinates
- **Too Few Points**: <3 points in array
- **Invalid JSON**: Malformed JSON structure

## System Prompt

```
You are a skilled designer creating cookie cutter shapes. You MUST respond with ONLY a valid JSON object in this EXACT format:

{
  "points": [{"x": number, "y": number}, {"x": number, "y": number}, ...],
  "reasoning": "Brief explanation of design choices",
  "category": "animal|nature|object|food|holiday|abstract|vehicle|character"
}

RULES:
- points: Array of 15-30 coordinate objects forming a closed path
- Each point: {"x": number, "y": number} where numbers are between -30 and +30
- First and last points MUST be identical to close the shape
- Path traces clockwise around the outer edge
- reasoning: 1-2 sentences explaining design decisions
- category: Must be one of the listed options
- NO additional text, explanations, or markdown - ONLY the JSON object
```

## User Prompt Template

```
Create a cookie cutter outline for: "USER_DESCRIPTION"

REQUIREMENTS:
- Simple, recognizable silhouette suitable for cutting dough
- Closed path with NO gaps or holes
- Centered at origin (0,0)
- All coordinates between -30 and +30
- 15-30 points for optimal detail
- Clockwise path tracing outer edge
- First point = last point (closed)
- Smooth transitions between points
- No internal details or thin features

RESPOND WITH ONLY THE JSON OBJECT - NO OTHER TEXT.
```

## Example Outputs

### Cat Shape
```json
{
  "points": [
    {"x": 0, "y": 20}, {"x": -15, "y": 25}, {"x": -20, "y": 15},
    {"x": -25, "y": 5}, {"x": -20, "y": -5}, {"x": -30, "y": -20},
    {"x": -25, "y": -10}, {"x": -15, "y": -15}, {"x": 0, "y": -18},
    {"x": 15, "y": -15}, {"x": 25, "y": -10}, {"x": 30, "y": -20},
    {"x": 20, "y": -5}, {"x": 25, "y": 5}, {"x": 20, "y": 15},
    {"x": 15, "y": 25}, {"x": 0, "y": 20}
  ],
  "reasoning": "Cat silhouette with pointed ears and rounded body suitable for cookie cutting",
  "category": "animal"
}
```

### Star Shape
```json
{
  "points": [
    {"x": 0, "y": -25}, {"x": 7, "y": -8}, {"x": 25, "y": -8},
    {"x": 12, "y": 3}, {"x": 18, "y": 20}, {"x": 0, "y": 10},
    {"x": -18, "y": 20}, {"x": -12, "y": 3}, {"x": -25, "y": -8},
    {"x": -7, "y": -8}, {"x": 0, "y": -25}
  ],
  "reasoning": "Five-pointed star with balanced proportions for clean cookie cutting",
  "category": "abstract"
}
```

## Error Handling

### Fallback Chain:
1. **Primary**: OpenAI GPT-4 (with validation)
2. **Secondary**: Pattern matching (basic shapes)
3. **Tertiary**: Geometric generation (polygon based on complexity)

### Common Issues & Solutions:
- **Extra text**: Regex extraction finds JSON object
- **Markdown formatting**: Strips ```json``` blocks
- **Unclosed paths**: Automatically closes by duplicating first point
- **Out of bounds**: Coordinate clamping to valid range
- **Invalid category**: Defaults to "abstract"

This specification ensures consistent, reliable output from OpenAI for cookie cutter generation! 🍪✨
