import { ExplanationResponse } from "../types";

// A clean 5-page minimal PDF document
export const DEMO_PDF_BASE64 = 
  "JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFIgNCAwIFIgNSAwIFIgNiAwIFIgNyAwIFJdL0NvdW50IDU+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNzkyIDYxMl0vUmVzb3VyY2VzPDw+Pi9Db250ZW50cyA4IDAgUj4+ZW5kb2JqCjQgMCBvYmo8LC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCA3OTIgNjEyXS9SZXNvdXJjZXM8PD4+L0NvbnRlbnRzIDkgMCBSPj5lbmRvYmoKNSAwIG9iajw8L1R5cGUvUGFnZS9QYXJlbnQgMiAwIFIvTWVkaWFCb3hbMCAwIDc5MiA2MTJdL1Jlc291cmNlczw8Pj4vQ29udGVudHMgMTAgMCBSPj5lbmRvYmoKNiAwIG9iajw8L1R5cGUvUGFnZS9QYXJlbnQgMiAwIFIvTWVkaWFCb3hbMCAwIDc5MiA2MTJdL1Jlc291cmNlczw8Pj4vQ29udGVudHMgMTEgMCBSPj5lbmRvYmoKNyAwIG9iajw8L1R5cGUvUGFnZS9QYXJlbnQgMiAwIFIvTWVkaWFCb3hbMCAwIDc5MiA2MTJdL1Jlc291cmNlczw8Pj4vQ29udGVudHMgMTIgMCBSPj5lbmRvYmoKOCAwIG9iajw8L0xlbmd0aCA3MD4+c3RyZWFtCnEgQkwgL0YxIDE2IFRmIDEwMCA1MDAgVGQgKExlY3VyZSAxOiBJbnRyb2R1Y3Rpb24gdG8gTWFjaGluZSBMZWFybmluZykgVGogRVQgUQplbmRzdHJlYW0KZW5kb2JqCjkgMCBvYmo8LC9MZW5ndGggNzA+PnN0cmVhbQpxIEJMIC9GMSAxNiBUZiAxMDAgNTAwIFRkIChTbGlkZSAyOiBTdXBlcnZpc2VkIHZzIFVuc3VwZXJ2aXNlZCkgVGogRVQgUQplbmRzdHJlYW0KZW5kb2JqCjEwIDAgb2JqPDwvTGVuZ3RoIDcwPj5zdHJlYW0KcSBCTCAvRjEgMTYgVGYgMTAwIDUwMCBUZCAoU2xpZGUgMzogTGluZWFyIFJlZ3Jlc3Npb24gJiBHcmFkaWVudCkgVGogRVQgUQplbmRzdHJlYW0KZW5kb2JqCjExIDAgb2JqPDwvTGVuZ3RoIDcwPj5zdHJlYW0KcSBCTCAvRjEgMTYgVGYgMTAwIDUwMCBUZCAoU2xpZGUgNDogTmV1cmFsIE5ldHdvcmtzICYgRGVlcCkgVGogRVQgUQplbmRzdHJlYW0KZW5kb2JqCjEyIDAgb2JqPDwvTGVuZ3RoIDcwPj5zdHJlYW0KcSBCTCAvRjEgMTYgVGYgMTAwIDUwMCBUZCAoU2xpZGUgNTogTW9kZWwgRXZhbHVhdGlvbiAmIEdlbmVyYWxpemF0aW9uKSBUagpFVCBRCmVuZHN0cmVhbQplbmRvYmoKdHJhaWxlcjw8L1NpemUgMTMvUm9vdCAxIDAgUj4+CiUlRU9G";

export const DEMO_EXPLANATION: ExplanationResponse = {
  startSlide: 1,
  endSlide: 5,
  totalSlides: 5,
  detectedClassType: "logic",
  detectedClassTypeExplanation: "Adapted with simple first-principles analogies and step-by-step mathematical intuition for Machine Learning.",
  explanations: [
    {
      slideNumber: 1,
      explanation: `### Understanding Artificial Intelligence & Machine Learning

**The Core Motivation**
Historically, computers could only perform tasks with rigid, explicit instructions. Machine Learning changes the paradigm, allowing systems to learn rules directly from empirical data. This enables automation of complex tasks like medical diagnostics, self-driving cars, and language understanding that were previously impossible to program manually.

**Intuitive Metaphor**
Imagine teaching a child to recognize a dog. You don't give them a mathematical definition of a dog (e.g., ear angles, tail lengths). Instead, you show them many pictures of dogs and say 'dog', and pictures of cats and say 'not dog'. Over time, the child's brain automatically abstracts the visual patterns that distinguish dogs. Machine Learning works exactly like this training process.

**Detailed Explanation**
Traditional programming compiles explicit rules and input data to generate answers. In contrast, **Machine Learning** processes input data alongside known answers (labels) to synthesize the underlying rules or mathematical mapping function.

*   **Classic Program:** \`Rules + Data = Answers\`
*   **Machine Learning:** \`Data + Answers = Rules\`

**Core Terminology**
1.  **Features (X):** The input variables used to make predictions (e.g., house size, location).
2.  **Label (Y):** The variable we want to predict (e.g., house price).
3.  **Model:** The mathematical representation of the relationship between Features and Labels.

**Concrete Example**
Consider a spam filter. Instead of writing thousands of manually-updated 'if' statements checking for words like 'win', 'prize', or 'unsecured loan', we feed a machine learning model 10,000 emails labeled as 'spam' and 10,000 labeled as 'safe'. The model discovers which combinations of words and sender properties are highly correlated with spam and configures its own filtering rules.`
    },
    {
      slideNumber: 2,
      explanation: `### Supervised vs. Unsupervised Learning Paradigms

**The Core Motivation**
Not all datasets come with answers. If we want to predict a stock price, we have historical prices (labels) to train on. But if we want to segment a database of 1 million customers to design customized marketing campaigns, we don't have predefined customer categories. Knowing the difference between Supervised and Unsupervised learning tells us which algorithm to use in any real-world project.

**Intuitive Metaphor**
Imagine sorting a massive pile of books. **Supervised Learning** is like having a librarian stand over you, telling you exactly which shelf each book belongs to. **Unsupervised Learning** is like being left alone in a room with the books; you don't know the categories, but you start grouping them based on similarities (e.g., size, color, language, or topic clusters).

**Detailed Explanation**
1. **Supervised Learning**: In Supervised Learning, the training data contains both inputs and correct labels. The goal is to learn a mapping function f(x) that maps input X to output Y.
   * **Regression**: Predicts continuous numerical values (e.g., stock price, temperature).
   * **Classification**: Predicts discrete categories (e.g., Spam vs. Not Spam, Cat vs. Dog).

2. **Unsupervised Learning**: The training data contains only inputs with no labels. The model is left to find hidden structures, patterns, or groupings within the input data.
   * **Clustering**: Grouping similar data points together (e.g., K-Means).
   * **Dimensionality Reduction**: Simplifying data with many attributes while retaining core information (e.g., PCA).

**Concrete Example**
A credit card company uses supervised classification to identify fraud by looking at transactions that customers previously marked as fraudulent. Simultaneously, they use unsupervised clustering to find natural buying circles among cardholders, identifying groups like 'frequent travelers' or 'tech enthusiasts' based on purchase correlations.`
    },
    {
      slideNumber: 3,
      explanation: `### Introduction to Linear Regression & Gradient Descent

**The Core Motivation**
Linear Regression is the absolute bedrock of quantitative modeling. Almost all advanced deep learning models build upon the basic concepts established here. It allows us to fit a trendline to noisy observations and make quantitative, continuous forecasts.

**Intuitive Metaphor**
Imagine planting a seed. You measure its height every day: Day 1 (2cm), Day 2 (4cm), Day 3 (6cm). You naturally draw a straight line through these points to predict it will be 8cm on Day 4. Linear Regression is simply the formal, mathematical way of drawing that 'best-fitting' straight line through noisy real-world data points.

**Detailed Explanation**
The Linear Model Equation represents the relationship between a dependent variable Y and independent variable X as a straight line:

Y = wX + b

Where:
* **w (Weight/Slope)**: The sensitivity of Y to changes in X.
* **b (Bias/Intercept)**: The value of Y when X = 0.

**Measuring Error: Mean Squared Error (MSE)**
To find the best line, we need to mathematically define 'badness'. We measure the distance from our line to every actual data point, square those distances, and average them:

MSE = 1/n * Sum( (y_i - y_pred_i)² )

Our objective is to find w and b that minimize this Mean Squared Error.

**Gradient Descent Optimization**
Gradient Descent is the blindfolded mountaineer feeling the slope of the terrain. Step by step, the algorithm computes the slope of the error and steps in the opposite direction to find the bottom of the valley (the minimum cost):

w <- w - α * dJ/dw

Where α is the **Learning Rate**. Too small makes it incredibly slow; too large causes it to overshoot the valley and bounce around.

**Concrete Example**
Real estate agents use linear regression to estimate house valuations. If they plot house size (X) against final price (Y), they find a linear trend. The weight w represents the average price increase per additional square foot (e.g., $150/sqft), and the bias b represents base property costs.`
    },
    {
      slideNumber: 4,
      explanation: `### Biological vs. Artificial Neural Networks

**The Core Motivation**
Linear models struggle with complex, non-linear relationships like images or human speech. To solve these complex problems, computer scientists looked to the most powerful computer in existence: the human brain. Neural Networks provide a flexible structure capable of modeling any mathematical pattern.

**Intuitive Metaphor**
Our brains are made of billions of cells called neurons, connected by wires. When a neuron receives electrical signals from its neighbors, it adds them up. If the total electricity is strong enough, it 'fires', sending a signal to the next neurons down the line. An Artificial Neural Network replicates this structure using simple numbers and equations.

**Detailed Explanation**
* **Dendrite (Inputs)**: Represented by input numbers (x_1, x_2, ...).
* **Soma (Cell Body)**: Represented by a weighted sum (z = w_1*x_1 + w_2*x_2 + b).
* **Axon (Output Signal)**: Represented by passing the sum through an **Activation Function** (like ReLU or Sigmoid) to determine the output value.

**Activation Functions**
Without activation functions, a neural network is just a giant linear equation. The activation function introduces **non-linearity**, allowing the network to learn complex curved boundaries and intricate nested patterns.

**Concrete Example**
When you look at a handwritten number '8', individual early neurons in your visual cortex fire when they see simple circles or horizontal bars. Deep neurons combine these signals to conclude 'there is a loop on top and a loop on the bottom'. Finally, a high-level neuron fires indicating 'This is the number 8!'.`
    },
    {
      slideNumber: 5,
      explanation: `### Model Generalization & Overfitting

**The Core Motivation**
If a student memorizes every single practice exam question word-for-word, they might get 100% on practice tests. But if the actual exam has slightly different questions, they will fail because they didn't learn the concepts. Overfitting is the machine learning equivalent of memorization, and avoiding it is the number one priority in real-world ML deployment.

**Intuitive Metaphor**
Imagine training a dog to sit. You train them in your kitchen. However, you accidentally say 'sit' only when holding a bacon treat in your left hand. The dog memorizes these exact noise and gesture patterns. When you go to a park and say 'sit' with no treat, the dog stares blankly. The dog 'overfitted' to your kitchen and the treat, rather than generalizing the verbal command.

**Detailed Explanation**
During training, we split our data into a **Training Set** (for model optimization) and a **Validation/Test Set** (to measure true generalization performance).

*   **Underfitting:** Model is too simple to capture patterns. High training error, high validation error.
*   **Good Fit:** Model learns the core concepts. Low training error, low validation error.
*   **Overfitting:** Model memorizes noisy details and training-set specifics. Low training error, but extremely high validation error.

**Concrete Example**
If you fit a highly flexible 10th-degree polynomial curve to 5 noisy linear house-price data points, the curve will pass through every single point perfectly. However, the curve will wildly spike up and down in between the points, making ridiculous predictions for new houses.`
    }
  ]
};
