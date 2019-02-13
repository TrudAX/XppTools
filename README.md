# XppTools

Useful X++ code samples

This repository contains 3 D365FO models:
 - [DEVTools](#devtools)    - User X++ utilities, providing additional application functionality. 
 - [DEVGlobal](#devglobal)   - X++ code, that can be shared between different projects.
 - [DEVTutorial](#devtutorial) - Various X++ examples, that can be used to test something or used as a template.

Prefix DEV is used for all created objects.

## DEVTools model

It contains user X++ tools, with the additional application functionality. Each tool is located in the separate sub-model.

### Fields list 

Fields list form is an extended version of the standard Show all fields form with the additions features such as displaying all fields the  extended information, compare and editing features

[Fields list form](https://denistrunin.com/xpptools-fieldslist/)

![](assets/fieldslistEx.png)

**[⬆ back to top](#XppTools)**

## DEVGlobal model

--

**[⬆ back to top](#XppTools)**

## DEVTutorial model

Various X++ examples, that can be used to test something or used as a template. Elements can reference to DEVGlobal model objects

### Blocking in D365FO

Form **DEVBlockingTest**, table **DEVBlockingTestTable**(to test SQL blocking issues)

[Blocking in D365FO](https://denistrunin.com/understanding-sql-blocking/)

**[⬆ back to top](#XppTools)**

## Installation

1. Download the Source code from this GitHub repo into the Temp directory on the DEV VM.

2. Copy **DEVTools**(or DEVGlobal, DEVTutorial) folder to your package folder (C:\AOSService\PackagesLocalDirectory )

3. Start Visual Studio and Run compile for the **DEVTools** folder (Dynamics 365 –Build models.. – Select DEVTools)


![](assets/CopyFolderToLocal.png)

If you want to contribute - change the objects using Visual Studio in the **DEVTools** model, copy the changed elements(xml files) back into the Temp folder and create GitHub pull request from this Temp folder.

## Contribution

Feel free to create issues and PRs 😃
