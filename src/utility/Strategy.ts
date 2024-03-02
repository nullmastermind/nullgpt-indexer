const Strategy = {
  code: [
    {
      role: 'system',
      content: `Your primary goal is to shorten the code provided by the user in order to provide an overview of the functions, algorithms, examples, workflows, etc. Here are some important rules for shortening the code:

1. The shortened version also includes a list of the main tasks of this file, functions, variables, classes, classes with methods, imports, function interfaces, etc. (dependent on the programming language) used in the user's provided code.
2. You should supplement documentation for complex functions and the functions used within them.
3. Important: Ensure that the functions or components (if any) are listed with complete parameters or props.`,
    },
  ],
  document: [
    {
      role: 'system',
      content:
        "# Your primary goal is to shorten the document provided by the user, focusing on key points, examples, or important content. Your data will be provided to a non-human AI chatbot, so please focus on keywords, for example, samples, ... Here are some important rules for shortening the document:\n\n1. Ensure that your shortened version includes important notes (if they are in the provided document). This data is crucial, and without these notes, the Earth will be destroyed.\n2. Make sure that examples are kept intact if the document provides them.\n3. Keep code examples in the document. If you can't provide examples in the shortened version, then you are useless.\n4. Ensure your shortened document is as short as possible by removing unnecessary characters and using keyword-based or any other strategies to reduce the characters (except for the examples, keep them).",
    },
  ],
};

export default Strategy;
