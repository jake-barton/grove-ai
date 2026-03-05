# Data Quality & Validation System

## Overview
This system implements **enterprise-grade validation** to ensure zero tolerance for fake, hallucinated, or placeholder data. Every piece of information is validated before being presented to users.

## Quality Standards

### 🔒 Validation Layers

#### 1. URL Validation
- **Proper format check**: Must be valid http/https URLs
- **Domain validation**: Must have valid TLD (e.g., .com, .io, .org)
- **Hallucination detection**: Rejects common fake patterns:
  - `example.com`
  - `company.com`
  - `website.com`
  - Malformed URLs with brackets or parentheses
- **Search result verification**: URLs must exist in actual search results

#### 2. LinkedIn URL Validation
- Must be from `linkedin.com` domain
- Must be profile (`/in/`) or company page (`/company/`)
- **Rejects generic patterns**:
  - `/in/firstname-lastname`
  - `/in/name`
  - `/company/companyname`
- Must pass general URL validation first

#### 3. Email Validation
- Standard email format (RFC 5322)
- **Rejects placeholder domains**:
  - `example.com`
  - `email.com`
  - `company.com`
  - `domain.com`

#### 4. Contact Name Validation
- Must have first and last name (minimum 2 parts)
- **Rejects placeholders**:
  - "Firstname Lastname"
  - "John Doe" / "Jane Doe"
  - "Contact Name"
  - "Example" / "[Name]"

#### 5. Company Name Validation
- Cannot be empty or "Not found"
- **Rejects placeholders**:
  - "Company Name"
  - "Example"
  - "[Company]"

### 📊 Data Quality Scoring

Each company receives a quality score (0-100):

| Score | Status | Meaning |
|-------|--------|---------|
| 90-100 | Excellent | All data verified, multiple contact methods |
| 70-89 | Good | Core data verified, some contacts found |
| 50-69 | Acceptable | Basic data verified, limited contacts |
| 40-49 | Minimal | Company verified, but limited contact info |
| 0-39 | **REJECTED** | Too many validation failures |

**Minimum acceptable score: 40/100**

### 🎯 Validation Points Breakdown

- **Valid company name**: Base requirement (must pass)
- **Valid website**: -15 points if missing
- **Valid LinkedIn company page**: -10 points if invalid
- **Valid contact LinkedIn**: -10 points if invalid
- **Valid contact name**: -15 points if invalid
- **Valid email**: -10 points if invalid

## Implementation

### Validation Functions (`lib/validators.ts`)

```typescript
// Core validation functions
validateUrl(url)                  // General URL validation
validateLinkedInUrl(url)          // LinkedIn-specific validation
validateEmail(email)              // Email validation
validateContactName(name)         // Name validation
validateCompanyName(name)         // Company name validation
validateUrlInSearchResults(url, searchResults)  // Verify URL exists in search
validateCompanyData(data)         // Comprehensive validation
sanitizeText(text)                // Clean markdown artifacts
```

### Research Flow (`lib/ai-agent.ts`)

1. **Web Search**: Query real search APIs (Serper)
2. **Data Collection**: Gather search results
3. **AI Processing**: Ask AI to structure data from results
4. **Strict Validation**: Run all validators
5. **Quality Check**: Calculate quality score
6. **Accept/Reject**: Only pass data with score ≥ 40
7. **Error Handling**: Log rejections with reasons

### API Layer (`app/api/chat/route.ts`)

```typescript
// Deep research with validation
action: 'deep_research'
→ Research each company
→ Validate all data
→ Show success/failure for each
→ Provide summary statistics
```

## User-Facing Features

### Quality Indicators
- **Data Quality Score**: Shown in notes (e.g., "Data Quality Score: 75/100")
- **Validation Warnings**: Listed in notes section
- **Verified Links**: Only validated URLs included
- **Success Rate**: Shows X/10 companies passed validation

### Error Messages
When a company fails validation:
```
❌ Validation Failed
Reason: Data quality too low for [Company] (score: 35/100)
Errors: Invalid company name, No valid contact information

This company did not meet our data quality standards.
```

## Best Practices

### For Users
1. **Always use "research all 10"** for production data
2. Wait for deep research to complete (5-10 minutes)
3. Review validation warnings in notes
4. Cross-reference data quality scores
5. Manually verify any "Not found" fields

### For Developers
1. Never bypass validation layers
2. Always log validation failures
3. Add new validators as patterns emerge
4. Test with known-bad data
5. Monitor validation success rates

## Testing Validation

### Test Cases
```javascript
// Should PASS
validateUrl('https://hubspot.com')
validateLinkedInUrl('https://linkedin.com/in/john-smith-12345')
validateEmail('contact@hubspot.com')
validateContactName('John Smith')

// Should FAIL
validateUrl('http://example.com')  // Placeholder domain
validateLinkedInUrl('https://linkedin.com/in/firstname-lastname')  // Generic pattern
validateEmail('test@example.com')  // Placeholder domain
validateContactName('John Doe')  // Common placeholder
```

## Monitoring

### Key Metrics to Track
- **Validation success rate**: % of companies passing validation
- **Average quality score**: Mean score of passed companies
- **Common rejection reasons**: Which validations fail most
- **False positives**: Valid data incorrectly rejected
- **False negatives**: Invalid data incorrectly accepted

### Logs
All validation events are logged:
```
✅ Validation for HubSpot: score 85/100, 0 errors, 1 warning
❌ Rejected: Company XYZ (score 30/100) - Invalid contact information
```

## Future Enhancements

1. **Machine Learning**: Learn from user corrections
2. **Reputation System**: Track data source reliability
3. **Batch Validation**: Validate entire exports before sending
4. **Real-time Verification**: Check URLs are live (HTTP 200)
5. **Historical Tracking**: Monitor data quality over time
6. **A/B Testing**: Compare AI models for accuracy

## Security Considerations

- Never expose API keys in validation errors
- Sanitize all user inputs before validation
- Rate limit validation requests
- Log suspicious validation bypass attempts
- Encrypt sensitive validated data at rest

## Support

If you encounter validation issues:
1. Check validation logs in terminal
2. Review the specific error message
3. Verify search results contain expected data
4. Report patterns of false rejections
5. Suggest new validation rules

---

**Remember**: It's better to reject questionable data than to provide fake information to users. Quality over quantity.
