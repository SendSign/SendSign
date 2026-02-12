# SendSign Field Mapping Configuration

## Overview

The `SendSign_Field_Mapping__mdt` custom metadata type maps Salesforce object fields to SendSign merge fields. This allows automatic population of document templates with data from Salesforce records.

## Custom Metadata Type: `SendSign_Field_Mapping__mdt`

### Fields

| Field API Name | Type | Description |
|---|---|---|
| `Salesforce_Field__c` | Text(255) | API name of the Salesforce field (e.g., `Account.Name`) |
| `SendSign_Merge_Field__c` | Text(255) | Corresponding SendSign merge field name (e.g., `client_name`) |
| `Template_Id__c` | Text(36) | SendSign template UUID this mapping applies to. Use `All` for all templates. |

## Example Mappings

| Salesforce Field | SendSign Merge Field | Template |
|---|---|---|
| `Account.Name` | `client_name` | All |
| `Opportunity.Amount` | `contract_amount` | SOW Template |
| `Contact.Email` | `signer_email` | All |
| `Contact.Name` | `signer_name` | All |
| `Opportunity.CloseDate` | `effective_date` | SOW Template |
| `Account.BillingStreet` | `billing_address` | Invoice Template |
| `Account.BillingCity` | `billing_city` | Invoice Template |
| `Account.BillingState` | `billing_state` | Invoice Template |

## How to Configure

1. Go to **Setup** → **Custom Metadata Types** → **SendSign Field Mapping** → **Manage Records**
2. Click **New** to create a mapping
3. Enter the Salesforce field API name, SendSign merge field name, and template ID
4. Save

## Notes

- Field mappings are per-template. Use `All` in the Template ID to apply a mapping to all templates.
- Salesforce field names should be the API name (e.g., `Name`, `Amount`, `CloseDate`)
- For related object fields, use dot notation (e.g., `Account.Name` when on Opportunity)
- Changes to custom metadata take effect immediately — no deployment needed
