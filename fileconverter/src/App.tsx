import { useState } from 'react';
import Button from '@mui/material/Button';
import './App.css'

export default function App() {
  const [count, setCount] = useState(0);

  function incrementCount() {
    setCount(count + 1);
  }

  return(
    <Button variant="contained" color="primary" onClick={incrementCount}>Increment: {count}</Button>
  );
}
